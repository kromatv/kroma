//! Library scanning: walk media roots, parse names, group files into logical
//! items (Plex-style), and build the set of libraries/shows/items to persist.
//!
//! Phase 1 (this module's [`scan_all`]) is **fast**: it only `stat`s each video
//! file (size + mtime no read, no ffprobe). Files are grouped into logical
//! items so the library is browsable in seconds. The slow per-file probing runs
//! later in [`crate::infra::probe`]'s background pass.
//!
//! Split into the per-folder filesystem [`walk`] worker and the stable
//! logical-id / edition [`ids`] derivation; this module owns the orchestration
//! that aggregates them into the [`ScanData`] handed to [`crate::db::sync_all`].

mod ids;
pub mod walk;

use std::collections::HashMap;
use std::path::Path;

use tracing::{info, warn};

use crate::model::{Library, LibraryKind, MediaItem, Show};
use crate::services::settings::LibraryDef;

use walk::scan_root;

pub use ids::{movie_logical_id, short_hash};

/// Everything a phase-1 scan produces, ready to hand to [`crate::db::sync_all`].
#[derive(Debug, Default)]
pub struct ScanData {
    pub libraries: Vec<Library>,
    pub shows: Vec<Show>,
    pub items: Vec<MediaItem>,
    // `file_id -> mtime-secs` for every scanned file. Carried here (rather than
    // on `MediaFile`, which is the client JSON contract) so the DB sync can
    // detect changed files. Owned by this scan no shared global, so two
    // overlapping scans (watcher rescan + `POST /api/scan`) can't steal each
    // other's entries.
    pub mtimes: HashMap<String, Option<i64>>,
}

/// Walk every configured library (each may span multiple folders) and build the
/// full index (phase 1, fast: no ffprobe). Files are `stat`-ed and grouped into
/// logical items. Items from every folder of a library share that library's id.
pub fn scan_all(defs: &[LibraryDef]) -> ScanData {
    let mut data = ScanData::default();
    // Logical items, keyed by stable logical id, accumulating their files.
    let mut items: HashMap<String, MediaItem> = HashMap::new();
    // Dedupe shows across the whole scan by show id.
    let mut shows: HashMap<String, Show> = HashMap::new();

    for def in defs {
        let mut movie_seen = false;
        let mut episode_seen = false;
        // Logical ids first seen in this library, to compute item_count.
        let mut lib_item_ids = std::collections::HashSet::new();

        for folder in &def.folders {
            let root = Path::new(folder);
            if !root.is_dir() {
                warn!(path = %root.display(), "media dir does not exist or is not a directory; skipping");
                continue;
            }
            scan_root(
                &def.id,
                root,
                &mut items,
                &mut shows,
                &mut data.mtimes,
                &mut lib_item_ids,
                &mut movie_seen,
                &mut episode_seen,
            );
        }

        // Auto-detect kind from contents, unless the def pins one.
        let detected = match (movie_seen, episode_seen) {
            (false, true) => LibraryKind::Shows,
            (true, true) => LibraryKind::Mixed,
            _ => LibraryKind::Movies,
        };
        let kind = match def.kind.as_str() {
            "movies" => LibraryKind::Movies,
            "shows" => LibraryKind::Shows,
            "mixed" => LibraryKind::Mixed,
            _ => detected,
        };

        info!(library = %def.name, items = lib_item_ids.len(), "scanned library");
        data.libraries.push(Library {
            id: def.id.clone(),
            name: def.name.clone(),
            kind,
            path: def.folders.join(", "),
            item_count: lib_item_ids.len(),
        });
    }

    data.shows = shows.into_values().collect();
    data.items = items.into_values().collect();
    data
}

/// Current time as an RFC3339 / ISO8601 string (UTC). Re-exported from kroma-primitives.
pub use kroma_primitives::now_iso8601;

/// Phase-1 rescan + DB sync, demo-seeding only in demo mode (no libraries
/// configured). Pure work (no events / no background spawns) so both the `POST
/// /api/scan` handler and the `library.scan` job can share it and add their own
/// notifications. Blocking (walk + SQLite) call from a blocking context.
pub fn rescan_sync(state: &crate::state::SharedState) -> anyhow::Result<ScanData> {
    let defs = crate::services::settings::library_defs(&state.settings, &state.config);
    let mut data = scan_all(&defs);
    // Seed demo content only when nothing is configured (true demo mode). A
    // configured library that momentarily reads empty NAS/SMB unmount, slow
    // mount, permission glitch must NOT be clobbered with demo movies.
    if data.items.is_empty() && defs.is_empty() {
        info!("no libraries configured and scan is empty; seeding demo content");
        data = crate::services::demo::demo_data();
    }
    crate::db::sync_all(&state.db, &data.libraries, &data.shows, &data.items, &data.mtimes)?;
    Ok(data)
}

/// Publish "scan started", run phase-1 [`rescan_sync`], then announce the
/// catalog change with the resulting counts. Blocking; returns the synced data.
/// Shared by `POST /api/scan` and the `library.scan` job each wraps it with
/// its own logging / response.
pub fn scan_and_publish(state: &crate::state::SharedState) -> anyhow::Result<ScanData> {
    use crate::infra::events::ServerEvent;
    state.events.publish(ServerEvent::ScanStarted);
    crate::services::activity::scan_started(&state.activity);

    let data = rescan_sync(state)?;
    let (libraries, shows, items) = (data.libraries.len(), data.shows.len(), data.items.len());
    crate::services::activity::scan_completed(&state.activity, libraries, shows, items, now_iso8601());
    state.events.publish(ServerEvent::ScanCompleted { items, shows, libraries });
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(data)
}

/// Kick the phase-2 background follow-ups after a scan media probing, search
/// reindex and TMDB enrichment (each reports its own progress in the activity
/// feed). Shared by `POST /api/scan` and the `library.scan` job.
pub fn spawn_follow_ups(state: &crate::state::SharedState, data: &ScanData) {
    crate::infra::probe::spawn_probe_pass(
        state.db.clone(),
        state.ffprobe_available,
        state.events.clone(),
        state.activity.clone(),
    );
    crate::services::search::spawn_reindex(state.clone());
    crate::services::enrich::maybe_spawn(state, &data.items, &data.shows);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Kind;
    use std::sync::atomic::{AtomicU32, Ordering};

    // A fresh, empty temp directory for one test.
    fn tmp_root(tag: &str) -> std::path::PathBuf {
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("kroma-scanall-{tag}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn def(id: &str, name: &str, kind: &str, folders: Vec<String>) -> LibraryDef {
        LibraryDef { id: id.into(), name: name.into(), kind: kind.into(), folders, auto_scan: true }
    }

    #[test]
    fn scan_all_with_no_defs_is_empty() {
        let data = scan_all(&[]);
        assert!(data.libraries.is_empty());
        assert!(data.items.is_empty());
        assert!(data.shows.is_empty());
        assert!(data.mtimes.is_empty());
    }

    #[test]
    fn scan_all_auto_detects_movies_and_counts_items() {
        let root = tmp_root("movies");
        let folder = root.to_string_lossy().into_owned();
        std::fs::write(root.join("The Matrix (1999).mkv"), b"x").unwrap();
        std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();

        let data = scan_all(&[def("lib1", "Films", "", vec![folder.clone()])]);
        assert_eq!(data.libraries.len(), 1);
        let lib = &data.libraries[0];
        assert_eq!(lib.id, "lib1");
        assert_eq!(lib.name, "Films");
        assert_eq!(lib.kind, LibraryKind::Movies);
        assert_eq!(lib.item_count, 2);
        assert_eq!(lib.path, folder);
        assert_eq!(data.items.len(), 2);
        assert!(data.shows.is_empty());
        assert_eq!(data.mtimes.len(), 2, "one mtime recorded per scanned file");
        assert!(data.items.iter().all(|i| i.kind == Kind::Movie && i.library == "lib1"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_all_auto_detects_shows_from_episodes() {
        let root = tmp_root("shows");
        let show = root.join("Breaking Bad");
        std::fs::create_dir_all(&show).unwrap();
        std::fs::write(show.join("Breaking Bad S01E01.mkv"), b"x").unwrap();
        std::fs::write(show.join("Breaking Bad S01E02.mkv"), b"x").unwrap();

        let data = scan_all(&[def("lib2", "Series", "", vec![root.to_string_lossy().into_owned()])]);
        assert_eq!(data.libraries[0].kind, LibraryKind::Shows);
        assert_eq!(data.shows.len(), 1);
        assert_eq!(data.items.len(), 2);
        assert!(data.items.iter().all(|i| i.kind == Kind::Episode));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_all_auto_detects_mixed_content() {
        let root = tmp_root("mixed");
        std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();
        let show = root.join("The Office");
        std::fs::create_dir_all(&show).unwrap();
        std::fs::write(show.join("The Office S01E01.mkv"), b"x").unwrap();

        let data = scan_all(&[def("lib3", "Mixed", "", vec![root.to_string_lossy().into_owned()])]);
        assert_eq!(data.libraries[0].kind, LibraryKind::Mixed);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_all_pinned_kind_overrides_detection() {
        let root = tmp_root("pinned");
        // Contents look like a movie, but the def pins the library to "shows".
        std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();

        let data =
            scan_all(&[def("lib4", "Pinned", "shows", vec![root.to_string_lossy().into_owned()])]);
        assert_eq!(data.libraries[0].kind, LibraryKind::Shows);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_all_skips_a_missing_folder_but_still_lists_the_library() {
        let base = tmp_root("missing");
        let absent = base.join("does-not-exist");
        let data =
            scan_all(&[def("lib5", "Ghost", "", vec![absent.to_string_lossy().into_owned()])]);
        // The (empty) library row is still produced; no items and no crash.
        assert_eq!(data.libraries.len(), 1);
        assert_eq!(data.libraries[0].item_count, 0);
        assert!(data.items.is_empty());
        // No content -> auto-detect degenerates to Movies.
        assert_eq!(data.libraries[0].kind, LibraryKind::Movies);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn scan_all_multi_folder_library_shares_id_and_aggregates() {
        let a = tmp_root("multi-a");
        let b = tmp_root("multi-b");
        std::fs::write(a.join("Heat (1995).mkv"), b"x").unwrap();
        std::fs::write(b.join("Dune (2021).mkv"), b"x").unwrap();

        let data = scan_all(&[def(
            "lib6",
            "Split",
            "movies",
            vec![a.to_string_lossy().into_owned(), b.to_string_lossy().into_owned()],
        )]);
        assert_eq!(data.libraries.len(), 1);
        // Both folders' items count toward the one library.
        assert_eq!(data.libraries[0].item_count, 2);
        assert!(data.libraries[0].path.contains(", "), "path lists both folders");
        assert_eq!(data.items.len(), 2);
        assert!(data.items.iter().all(|i| i.library == "lib6"));

        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
    }

    use crate::services::settings::{set_library_defs, LibraryDef};
    use crate::test_support::test_state;

    fn configured_library(dir: &std::path::Path) -> LibraryDef {
        LibraryDef {
            id: "lib-1".into(),
            name: "Films".into(),
            kind: "movies".into(),
            folders: vec![dir.to_string_lossy().into_owned()],
            auto_scan: true,
        }
    }

    fn item_count(state: &crate::state::SharedState) -> i64 {
        state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn a_server_with_nothing_configured_gets_the_demo_catalogue() {
        // True demo mode: no libraries at all. Showing an empty app on first run
        // makes it look broken, so the demo content stands in.
        let state = test_state();
        let data = rescan_sync(&state).unwrap();
        assert!(!data.items.is_empty(), "demo content should have been seeded");
        assert!(item_count(&state) > 0);
    }

    #[test]
    fn a_configured_library_that_reads_empty_is_never_replaced_with_demo_content() {
        // The case this guard exists for: an NAS/SMB share that is unmounted, or
        // slow to mount, or briefly unreadable, scans as ZERO items. Seeding on
        // an empty RESULT rather than an empty CONFIG would replace the user's
        // real library with demo movies - and the next scan would have nothing
        // to restore it from.
        let state = test_state();
        let empty = std::env::temp_dir().join(format!("kroma-unmounted-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&empty);
        std::fs::create_dir_all(&empty).unwrap();
        set_library_defs(&state.settings, &state.db, &[configured_library(&empty)]);

        let data = rescan_sync(&state).unwrap();
        assert!(data.items.is_empty(), "the folder is empty, so the scan is empty");
        assert_eq!(item_count(&state), 0, "demo content was seeded over a real library");
    }

    #[test]
    fn a_library_pointed_at_a_folder_that_is_not_there_is_also_left_alone() {
        // Same failure, harsher: the mount point does not exist at all.
        let state = test_state();
        let missing = std::env::temp_dir().join("kroma-no-such-mount-point-ever");
        let _ = std::fs::remove_dir_all(&missing);
        set_library_defs(&state.settings, &state.db, &[configured_library(&missing)]);

        rescan_sync(&state).unwrap();
        assert_eq!(item_count(&state), 0);
    }

    #[test]
    fn a_scan_announces_its_start_and_its_counts() {
        // The UI shows a progress state off these, so a scan that never
        // announces completion leaves a spinner running forever.
        let state = test_state();
        let data = scan_and_publish(&state).unwrap();
        assert!(!data.items.is_empty(), "demo mode, so there is something to report");

        let activity = crate::services::activity::snapshot(&state.activity);
        let rendered = serde_json::to_string(&activity).unwrap_or_default();
        assert!(rendered.contains("scan"), "the activity feed says nothing about the scan");
    }
}
