use std::io::ErrorKind;
use std::path::Path;

use anyhow::{anyhow, bail, Context as _, Result};
use kroma_module_sdk::primitives::now_ms;
use serde::{Deserialize, Serialize};

use super::lock::SyncLock;
use super::DefinitionStore;

const COOLDOWN_MS: i64 = 15 * 60 * 1000;
const LAST_HEAL_FILE: &str = ".last-heal.json";

#[derive(Default, Serialize, Deserialize)]
struct LastHeal {
    attempted_at_ms: Option<i64>,
    failure: Option<String>,
}

impl DefinitionStore {
    pub(super) fn heal(&self, id: &str, path: &Path) -> Result<Vec<u8>> {
        let _running = SyncLock::take(&self.dir)?;
        if let Ok(bytes) = std::fs::read(path) {
            return Ok(bytes);
        }
        let last = LastHeal::read(&self.dir);
        if last.is_cooling() {
            bail!("{}", last.refusal(id));
        }
        let attempted_at_ms = Some(now_ms());
        let outcome = self.sync_now();
        LastHeal {
            attempted_at_ms,
            failure: outcome.as_ref().err().map(|e| format!("{e:#}")),
        }
        .write(&self.dir);
        let report = outcome
            .map_err(|e| anyhow!("definition '{id}' is not cached and the sync failed: {e:#}"))?;
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
    fn read(dir: &Path) -> Self {
        std::fs::read(dir.join(LAST_HEAL_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn write(&self, dir: &Path) {
        let written = serde_json::to_vec(self)
            .map_err(anyhow::Error::from)
            .and_then(|bytes| Ok(std::fs::write(dir.join(LAST_HEAL_FILE), bytes)?));
        if let Err(error) = written {
            tracing::warn!(%error, "the last definition sync was not recorded");
        }
    }

    fn is_cooling(&self) -> bool {
        self.attempted_at_ms
            .is_some_and(|at| (0..COOLDOWN_MS).contains(&(now_ms() - at)))
    }

    fn refusal(&self, id: &str) -> String {
        let minutes = COOLDOWN_MS / 60_000;
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
    use super::super::DefinitionStore;

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
    fn an_instance_does_not_download_what_another_instance_already_found_missing() {
        let (source, requests) = counted(200, tarball(&[(SOMETHING_ELSE, DEMO_YML)]));
        let one_instance = store_for(source.clone());
        let another_instance = DefinitionStore {
            dir: one_instance.dir().to_path_buf(),
            source,
            route: Ok(None),
        };

        let first = format!("{:#}", one_instance.load("demo").unwrap_err());
        let second = format!("{:#}", another_instance.load("demo").unwrap_err());

        assert!(first.contains("not in the definition set"), "{first}");
        assert!(second.contains("not in the definition set"), "{second}");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn instances_racing_on_a_missing_definition_share_one_sync() {
        let (source, requests) = counted(200, tarball(&[(DEMO, DEMO_YML)]));
        let first = store_for(source.clone());
        let others: Vec<DefinitionStore> = (0..3)
            .map(|_| DefinitionStore {
                dir: first.dir().to_path_buf(),
                source: source.clone(),
                route: Ok(None),
            })
            .collect();

        let healed = std::thread::scope(|threads| {
            let racing: Vec<_> = others
                .iter()
                .map(|store| threads.spawn(|| store.load("demo").is_ok()))
                .collect();
            racing
                .into_iter()
                .filter_map(|handle| handle.join().ok())
                .filter(|healed| *healed)
                .count()
        });

        assert_eq!(healed, 3);
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
