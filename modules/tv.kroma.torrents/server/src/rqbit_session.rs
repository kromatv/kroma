//! Keeping the engine's own session store startable.
//!
//! librqbit restores every torrent it persisted before its session is usable,
//! and it awaits all of them: `Session::new_with_opts` does not return until the
//! last one is added. A persisted entry whose `.torrent` is missing or empty has
//! no metadata to restore FROM, so librqbit goes looking for it — and for a
//! private tracker, which means no DHT and no peer exchange, that search never
//! finishes. One such entry holds the whole engine, and with it every route this
//! module serves, for as long as the process runs.
//!
//! So they are dropped before the session opens. Nothing is lost: this module's
//! own ledger is the record of what is being downloaded, and it re-adds a row
//! that the engine does not know about. That add is per-torrent and detached, so
//! the same dead magnet then blocks only itself.

use std::path::Path;

const STORE: &str = "session.json";

/// Drop the persisted torrents that cannot be restored without the network.
/// Returns how many were dropped, for the log.
pub fn prune_unrestorable(session_dir: &Path) -> usize {
    let store = session_dir.join(STORE);
    let Ok(raw) = std::fs::read_to_string(&store) else {
        return 0;
    };
    let Ok(mut root) = serde_json::from_str::<serde_json::Value>(&raw) else {
        tracing::debug!("the engine's session store is not readable JSON; leaving it alone");
        return 0;
    };
    let Some(torrents) = root.get_mut("torrents").and_then(|t| t.as_object_mut()) else {
        return 0;
    };

    let dead: Vec<String> = torrents
        .iter()
        .filter_map(|(id, entry)| {
            let hash = entry.get("info_hash")?.as_str()?;
            (!has_metadata(session_dir, hash)).then(|| id.clone())
        })
        .collect();
    if dead.is_empty() {
        return 0;
    }

    for id in &dead {
        if let Some(hash) = torrents
            .get(id)
            .and_then(|e| e.get("info_hash"))
            .and_then(|h| h.as_str())
            .map(str::to_string)
        {
            // The stub and its fastresume bitfield go with the entry: keeping
            // them would only have the next start find the same empty file.
            let _ = std::fs::remove_file(session_dir.join(format!("{hash}.torrent")));
            let _ = std::fs::remove_file(session_dir.join(format!("{hash}.bitv")));
        }
        torrents.remove(id);
    }

    let Ok(next) = serde_json::to_string(&root) else {
        return 0;
    };
    if std::fs::write(&store, next).is_err() {
        tracing::warn!("could not rewrite the engine's session store; leaving it alone");
        return 0;
    }
    dead.len()
}

fn has_metadata(session_dir: &Path, info_hash: &str) -> bool {
    std::fs::metadata(session_dir.join(format!("{info_hash}.torrent")))
        .map(|at| at.len() > 0)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(dir: &Path, torrents: &str) {
        std::fs::write(dir.join(STORE), format!("{{\"torrents\":{torrents}}}")).unwrap();
    }

    fn metadata(dir: &Path, hash: &str, bytes: &[u8]) {
        std::fs::write(dir.join(format!("{hash}.torrent")), bytes).unwrap();
        std::fs::write(dir.join(format!("{hash}.bitv")), b"resume").unwrap();
    }

    fn entry(hash: &str) -> String {
        format!("{{\"info_hash\":\"{hash}\",\"is_paused\":false}}")
    }

    fn ids(dir: &Path) -> Vec<String> {
        let raw = std::fs::read_to_string(dir.join(STORE)).unwrap();
        let root: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let mut out: Vec<String> = root["torrents"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        out.sort();
        out
    }

    #[test]
    fn an_entry_with_no_metadata_on_disk_is_dropped() {
        let dir = kroma_testing::temp_dir("session-prune");
        metadata(dir.path(), "aa", b"d4:infod4:name1:ae");
        store(
            dir.path(),
            &format!("{{\"0\":{},\"1\":{}}}", entry("aa"), entry("bb")),
        );

        let dropped = prune_unrestorable(dir.path());

        assert_eq!(dropped, 1);
        assert_eq!(ids(dir.path()), ["0"]);
    }

    #[test]
    fn an_empty_torrent_file_counts_as_no_metadata() {
        // The exact shape librqbit leaves behind for a magnet it never
        // resolved, and the one that hangs the restore.
        let dir = kroma_testing::temp_dir("session-prune");
        metadata(dir.path(), "aa", b"");
        store(dir.path(), &format!("{{\"0\":{}}}", entry("aa")));

        assert_eq!(prune_unrestorable(dir.path()), 1);
        assert!(ids(dir.path()).is_empty());
    }

    #[test]
    fn the_stub_and_its_resume_data_go_with_the_entry() {
        let dir = kroma_testing::temp_dir("session-prune");
        metadata(dir.path(), "aa", b"");
        store(dir.path(), &format!("{{\"0\":{}}}", entry("aa")));

        prune_unrestorable(dir.path());

        assert!(!dir.path().join("aa.torrent").exists());
        assert!(!dir.path().join("aa.bitv").exists());
    }

    #[test]
    fn a_store_where_everything_restores_is_left_untouched() {
        let dir = kroma_testing::temp_dir("session-prune");
        metadata(dir.path(), "aa", b"d4:infod4:name1:ae");
        let before = format!("{{\"0\":{}}}", entry("aa"));
        store(dir.path(), &before);

        assert_eq!(prune_unrestorable(dir.path()), 0);
        assert_eq!(ids(dir.path()), ["0"]);
        assert!(dir.path().join("aa.bitv").exists());
    }

    #[test]
    fn anything_unreadable_is_left_exactly_as_it_was() {
        let dir = kroma_testing::temp_dir("session-prune");
        std::fs::write(dir.path().join(STORE), b"{not json").unwrap();

        assert_eq!(prune_unrestorable(dir.path()), 0);
        assert_eq!(
            std::fs::read_to_string(dir.path().join(STORE)).unwrap(),
            "{not json"
        );
    }

    #[test]
    fn a_first_run_with_no_store_yet_is_not_an_error() {
        let dir = kroma_testing::temp_dir("session-prune");

        assert_eq!(prune_unrestorable(dir.path()), 0);
    }

    #[test]
    fn a_store_that_names_no_torrents_is_left_exactly_as_it_was() {
        let dir = kroma_testing::temp_dir("session-prune");
        std::fs::write(dir.path().join(STORE), b"{\"version\":2}").unwrap();

        assert_eq!(prune_unrestorable(dir.path()), 0);
        assert_eq!(
            std::fs::read_to_string(dir.path().join(STORE)).unwrap(),
            "{\"version\":2}"
        );
    }
}
