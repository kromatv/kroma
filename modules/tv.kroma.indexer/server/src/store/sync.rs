use std::path::{Path, PathBuf};

use anyhow::{bail, Context as _, Result};

use super::lock::SyncLock;
use super::unpack::unpack;
use super::{is_yml, DefinitionStore, SyncReport};

const PURPOSE: &str = "indexer-definitions";

impl DefinitionStore {
    /// Downloads and extracts the current definition set, replacing the cache
    /// (extract to a temp dir, then swap the yml files in). Waits for any sync
    /// of the same cache already running, rather than extracting over it.
    pub fn sync(&self) -> Result<SyncReport> {
        let _running = SyncLock::take(&self.dir)?;
        self.sync_now()
    }

    pub(super) fn sync_now(&self) -> Result<SyncReport> {
        std::fs::create_dir_all(&self.dir).context("create defs dir")?;
        let tmp = self.dir.join(".sync-tmp");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).context("create sync tmp")?;

        let fetch = match &self.route {
            Ok(Some(proxy)) => kroma_module_sdk::http::Fetch::new()
                .purpose(PURPOSE)
                .socks5(proxy.as_str()),
            Ok(None) => kroma_module_sdk::http::Fetch::new().purpose(PURPOSE),
            Err(refusal) => bail!("{refusal}"),
        };
        let bytes = fetch
            .max_time(120)
            .get(&self.source)
            .context("download definitions")?
            .ensure_ok()?
            .body;
        unpack(&bytes, &tmp).context("tar failed")?;

        let defs_root = find_definitions_root(&tmp)
            .context("no definitions/ directory in the downloaded archive")?;
        let version =
            pick_version_dir(&defs_root).context("no version directory under definitions/")?;
        let src = defs_root.join(&version);

        let entries = std::fs::read_dir(&src)
            .context("read version dir")?
            .collect::<std::io::Result<Vec<_>>>()
            .context("read version dir")?;
        let mut count = 0;
        for entry in entries.iter().filter(|entry| is_yml(entry)) {
            std::fs::rename(entry.path(), self.dir.join(entry.file_name()))?;
            count += 1;
        }
        let _ = std::fs::remove_dir_all(&tmp);

        if count == 0 {
            bail!("archive contained no definitions");
        }
        Ok(SyncReport { count, version })
    }
}

fn find_definitions_root(tmp: &Path) -> Option<PathBuf> {
    for entry in std::fs::read_dir(tmp).ok()? {
        let entry = entry.ok()?;
        if entry.path().is_dir() {
            let candidate = entry.path().join("definitions");
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    let direct = tmp.join("definitions");
    direct.is_dir().then_some(direct)
}

fn definitions_in(dir: &Path) -> usize {
    std::fs::read_dir(dir).map_or(0, |entries| {
        entries
            .flatten()
            .filter(|entry| {
                let path = entry.path();
                path.extension()
                    .is_some_and(|extension| extension == "yml" || extension == "yaml")
            })
            .count()
    })
}

// Upstream opens a new schema folder long before it moves anything there: `v12` once
// held one definition beside `v11`'s 580. So the folder with the most wins, and the
// newer one when two hold the same.
fn pick_version_dir(defs_root: &Path) -> Option<String> {
    let mut best: Option<(usize, u32, String)> = None;
    for entry in std::fs::read_dir(defs_root).ok()? {
        let entry = entry.ok()?;
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(number) = name.strip_prefix('v').and_then(|d| d.parse::<u32>().ok()) {
            let held = definitions_in(&entry.path());
            if best
                .as_ref()
                .is_none_or(|(most, newest, _)| (held, number) > (*most, *newest))
            {
                best = Some((held, number, name));
            }
        }
    }
    best.map(|(_, _, name)| name)
}

#[cfg(test)]
mod tests;
