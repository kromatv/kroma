use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context as _, Result};

use super::DefinitionStore;

const COOLDOWN: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub(super) struct LastHeal {
    attempted_at: Option<Instant>,
    failure: Option<String>,
}

static GATES: Mutex<Option<HashMap<PathBuf, Arc<Mutex<LastHeal>>>>> = Mutex::new(None);

pub(super) fn gate(dir: &Path) -> Arc<Mutex<LastHeal>> {
    GATES
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .entry(dir.to_path_buf())
        .or_default()
        .clone()
}

impl DefinitionStore {
    pub(super) fn heal(&self, id: &str, path: &Path) -> Result<Vec<u8>> {
        let gate = gate(&self.dir);
        let mut last = gate.lock().unwrap();
        if let Ok(bytes) = std::fs::read(path) {
            return Ok(bytes);
        }
        if last.is_cooling() {
            bail!("{}", last.refusal(id));
        }
        last.attempted_at = Some(Instant::now());
        let report = self.sync_now().map_err(|e| {
            let why = format!("{e:#}");
            let refusal = anyhow!("definition '{id}' is not cached and the sync failed: {why}");
            last.failure = Some(why);
            refusal
        })?;
        last.failure = None;
        tracing::info!(
            definition = %id,
            count = report.count,
            version = %report.version,
            "definition missing from the cache; synced the definition set",
        );
        match std::fs::read(path) {
            Ok(bytes) => Ok(bytes),
            Err(e) if e.kind() == ErrorKind::NotFound => bail!(
                "definition '{id}' is not in the definition set ({} definitions, {})",
                report.count,
                report.version
            ),
            Err(e) => Err(e).with_context(|| format!("read definition '{id}'")),
        }
    }
}

impl LastHeal {
    fn is_cooling(&self) -> bool {
        self.attempted_at.is_some_and(|at| at.elapsed() < COOLDOWN)
    }

    fn refusal(&self, id: &str) -> String {
        let minutes = COOLDOWN.as_secs() / 60;
        match &self.failure {
            Some(why) => format!("definition '{id}' is not cached and the sync failed: {why}"),
            None => format!(
                "definition '{id}' is not in the definition set synced under {minutes} min ago"
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use super::super::test_support::{counted, store_for, tarball, DEMO_YML};

    const DEMO: &str = "Indexers-master/definitions/v11/demo.yml";
    const SOMETHING_ELSE: &str = "Indexers-master/definitions/v11/other.yml";

    #[test]
    fn a_definition_the_cache_lost_is_restored_by_one_sync() {
        let (source, requests) = counted(200, tarball(&[(DEMO, DEMO_YML)]));
        let store = store_for(source);

        let def = store.load("demo").expect("the missing definition healed");

        assert_eq!(def.name, "Demo Tracker");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn loads_racing_on_a_missing_definition_share_one_sync() {
        let (source, requests) = counted(200, tarball(&[(DEMO, DEMO_YML)]));
        let store = store_for(source);

        let healed = std::thread::scope(|threads| {
            let racing: Vec<_> = (0..6)
                .map(|_| threads.spawn(|| store.load("demo").is_ok()))
                .collect();
            racing
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .filter(|healed| *healed)
                .count()
        });

        assert_eq!(healed, 6);
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_definition_the_sync_did_not_bring_is_not_downloaded_again() {
        let (source, requests) = counted(200, tarball(&[(SOMETHING_ELSE, DEMO_YML)]));
        let store = store_for(source);

        let first = format!("{:#}", store.load("demo").unwrap_err());
        let second = format!("{:#}", store.load("demo").unwrap_err());

        assert!(first.contains("not in the definition set"), "{first}");
        assert!(second.contains("not in the definition set"), "{second}");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_heal_whose_sync_failed_says_that_rather_than_that_the_definition_is_unknown() {
        let (source, _) = counted(404, b"not found".to_vec());
        let store = store_for(source);

        let err = format!("{:#}", store.load("demo").unwrap_err());

        assert!(err.contains("sync failed"), "{err}");
        assert!(!err.contains("not in the definition set"), "{err}");
    }
}
