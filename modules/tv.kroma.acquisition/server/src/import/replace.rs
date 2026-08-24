//! What an upgrade superseded, and clearing it once the better release is on
//! disk. Never touches a path the import just wrote (a same-name overwrite
//! already replaced it in place), and never fails the import: an undeleted old
//! file is a duplicate, a half-imported upgrade is a hole in the library.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use kroma_module_sdk::db;
use kroma_module_sdk::domain::media::{detect_edition, edition_cut};
use kroma_module_sdk::host::HostStorage;
use crate::peers::downloads::DownloadRow;

use super::Replaced;

pub(super) fn drop_replaced<S: HostStorage>(
    state: &S,
    row: &DownloadRow,
    placed: &[(Replaced, String)],
    library: &str,
) {
    if row.tmdb_id == 0 {
        return;
    }
    let kept: HashSet<String> =
        placed.iter().map(|(_, at)| canonical(at)).collect();
    for path in superseded(state, row, placed, library) {
        if kept.contains(&canonical(&path)) {
            continue;
        }
        match std::fs::remove_file(&path) {
            // The one place the product deletes a user's media: say so where
            // they will look for it.
            Ok(()) => tracing::info!(
                target: "acquisition",
                release = %row.release_title,
                "replaced by the upgrade, deleted {path}"
            ),
            Err(e) => tracing::warn!(target: "acquisition", "could not delete {path}: {e}"),
        }
    }
}

fn canonical(path: &str) -> String {
    std::fs::canonicalize(path).map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| path.to_string())
}

fn superseded<S: HostStorage>(
    state: &S,
    row: &DownloadRow,
    placed: &[(Replaced, String)],
    library: &str,
) -> Vec<String> {
    let Ok(conn) = state.db().get() else { return Vec::new() };
    let mut out: Vec<String> = Vec::new();
    let show_id = db::show_by_tmdb(&conn, row.tmdb_id).ok().flatten();
    for (what, at) in placed {
        let found = match what {
            Replaced::Movie => db::movie_files_by_tmdb(&conn, row.tmdb_id, Some(library)),
            Replaced::Episode(season, episode) => match show_id.as_deref() {
                Some(id) => db::episode_files(&conn, id, *season, *episode, Some(library)),
                None => continue,
            },
        };
        match found {
            Ok(candidates) => out.extend(same_cut_singletons(&candidates, Path::new(at))),
            Err(e) => tracing::warn!(target: "acquisition", "upgrade: could not resolve the replaced file: {e}"),
        }
    }
    out
}

// A new file supersedes only the files of the SAME cut: one item holds every
// cut of a title (the scanner collapses them), so a Theatrical upgrade must not
// reach the Extended sitting beside it. And when one item is backed by several
// files of that cut it is a multi-part rip, of which the import replaced one
// part at most: leave the whole group alone rather than delete half a film.
//
// A file holding a run of episodes is left alone for the same reason: the
// upgrade covers the one episode it was grabbed for, and the rest of the run
// has nowhere else to live.
fn same_cut_singletons(candidates: &[db::LibraryFile], at: &Path) -> Vec<String> {
    let name = at.file_name().and_then(std::ffi::OsStr::to_str).unwrap_or_default();
    let cut = edition_cut(detect_edition(name).as_deref());
    let mut per_item: HashMap<&str, Vec<&str>> = HashMap::new();
    for file in candidates {
        if file.spans_episodes || edition_cut(file.edition.as_deref()) != cut {
            continue;
        }
        per_item.entry(file.item_id.as_str()).or_default().push(file.path.as_str());
    }
    per_item
        .into_values()
        .filter(|paths| paths.len() == 1)
        .flatten()
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, item: &str, edition: Option<&str>) -> db::LibraryFile {
        db::LibraryFile {
            path: path.into(),
            item_id: item.into(),
            edition: edition.map(str::to_string),
            spans_episodes: false,
        }
    }

    #[test]
    fn a_quality_upgrade_replaces_the_file_it_improves() {
        let old = file("/lib/Film (1982) 1080p.mkv", "i1", Some("1080p"));
        let out = same_cut_singletons(&[old], Path::new("/lib/Film (1982) 2160p.mkv"));
        assert_eq!(out, vec!["/lib/Film (1982) 1080p.mkv".to_string()]);
    }

    #[test]
    fn an_upgrade_of_one_cut_leaves_the_other_cuts_alone() {
        let candidates = vec![
            file("/lib/Film Theatrical 1080p.mkv", "i1", Some("Theatrical")),
            file("/lib/Film Extended 1080p.mkv", "i1", Some("Extended")),
        ];
        let out = same_cut_singletons(&candidates, Path::new("/lib/Film Theatrical 2160p.mkv"));
        assert_eq!(out, vec!["/lib/Film Theatrical 1080p.mkv".to_string()]);
    }

    #[test]
    fn an_upgrade_of_one_episode_never_deletes_the_file_holding_the_others() {
        let multi = db::LibraryFile { spans_episodes: true, ..file("/lib/Show S01E01-E02.mkv", "i1", None) };
        let out = same_cut_singletons(&[multi], Path::new("/lib/Show S01E01 2160p.mkv"));
        assert!(out.is_empty(), "E02 has nowhere else to live");
    }

    #[test]
    fn an_upgrade_never_deletes_half_a_multi_part_rip() {
        let candidates =
            vec![file("/lib/Film CD1.mkv", "i1", None), file("/lib/Film CD2.mkv", "i1", None)];
        let out = same_cut_singletons(&candidates, Path::new("/lib/Film 2160p.mkv"));
        assert!(out.is_empty(), "a part-pair is left whole, duplicates beat a hole");
    }
}
