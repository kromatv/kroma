//! Which name identifies the *series* an episode belongs to.
//!
//! A season folder is proof that the directory above it is a show folder, so
//! when the path has one the folder wins and every release naming convention
//! inside it collapses to a single show. Without a season folder the path says
//! nothing (a flat dump holds many shows side by side), so the filename is
//! read first and the containing directory is only the fallback for a file
//! that carries no name of its own.

use std::path::Path;

use super::marker::is_season_folder;
use super::title::{clean_title, parse_year};

/// The show a file belongs to: its title and, when the path or the name carries
/// one, its year.
pub(super) struct ShowIdentity {
    pub(super) title: String,
    pub(super) year: Option<u32>,
}

/// Resolve the show from the directories between the library `root` and the
/// file, the filename text preceding the season/episode marker, and the whole
/// stem as a last resort.
pub(super) fn identify(root: &Path, dirs: &[String], before: &str, stem: &str) -> ShowIdentity {
    let folder = show_folder(dirs).or_else(|| {
        clean_title(before)
            .is_empty()
            .then(|| nearest_named_dir(dirs).unwrap_or_else(|| root_name(root)))
    });

    let (title, source) = match folder {
        Some(dir) => (folder_title(dir), dir),
        None => (clean_title(before), before),
    };
    let title = match title {
        t if t.is_empty() => clean_title(stem),
        t => t,
    };
    let year = parse_year(source).or_else(|| nearest_named_dir(dirs).and_then(parse_year));
    ShowIdentity { title, year }
}

// A directory is a curated name rather than a release string, so when the junk
// stripper wipes one whole ("4k Shows", "UHD") the folder as written is still a
// better show title than nothing.
fn folder_title(dir: &str) -> String {
    match clean_title(dir) {
        t if t.is_empty() => dir.split_whitespace().collect::<Vec<_>>().join(" "),
        t => t,
    }
}

// The directory a season folder vouches for: the nearest ancestor above the
// trailing run of season folders. `None` when the path has no season folder at
// all, or when that run reaches the library root.
fn show_folder(dirs: &[String]) -> Option<&str> {
    let named = dirs
        .iter()
        .rposition(|d| !is_season_folder(d))
        .map_or(0, |i| i + 1);
    (named < dirs.len())
        .then(|| dirs[..named].last())
        .flatten()
        .map(String::as_str)
}

fn nearest_named_dir(dirs: &[String]) -> Option<&str> {
    dirs.iter()
        .rfind(|d| !is_season_folder(d))
        .map(String::as_str)
}

fn root_name(root: &Path) -> &str {
    root.file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirs(parts: &[&str]) -> Vec<String> {
        parts.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn a_season_folder_hands_the_show_to_the_directory_above_it() {
        let d = dirs(&["Shows", "Breaking Bad", "Season 01"]);

        let show = identify(Path::new("/lib"), &d, "", "S01E01");

        assert_eq!(show.title, "Breaking Bad");
    }

    #[test]
    fn the_directory_above_the_season_folder_wins_over_the_filename() {
        let d = dirs(&["The Office (US)", "Season 01"]);

        let show = identify(Path::new("/lib"), &d, "Office.US.", "Office.US.S01E01");

        assert_eq!(show.title, "The Office US");
        assert_eq!(show.year, None);
    }

    #[test]
    fn a_run_of_season_folders_is_skipped_whole() {
        let d = dirs(&["Breaking Bad", "Season 01", "Specials"]);

        let show = identify(Path::new("/lib"), &d, "", "S00E01");

        assert_eq!(show.title, "Breaking Bad");
    }

    #[test]
    fn a_flat_folder_lets_each_filename_name_its_own_show() {
        let d = dirs(&["all"]);
        let root = Path::new("/lib");

        let one = identify(root, &d, "Breaking.Bad.", "Breaking.Bad.S01E01.1080p");
        let two = identify(root, &d, "The.Office.", "The.Office.S01E01.1080p");

        assert_eq!(one.title, "Breaking Bad");
        assert_eq!(two.title, "The Office");
    }

    #[test]
    fn a_nameless_file_takes_the_folder_holding_it() {
        let d = dirs(&["Breaking Bad (2008)"]);

        let show = identify(Path::new("/lib"), &d, "", "S01E01");

        assert_eq!(show.title, "Breaking Bad");
        assert_eq!(show.year, Some(2008));
    }

    #[test]
    fn a_nameless_file_at_the_library_root_takes_the_root_folder() {
        let root = Path::new("/media/4k Shows");

        let one = identify(root, &[], "", "S01E01");
        let two = identify(root, &[], "", "S01E02");

        assert_eq!(one.title, "4k Shows");
        assert_eq!(one.title, two.title);
    }

    #[test]
    fn a_year_missing_from_the_filename_is_widened_from_the_show_folder() {
        let d = dirs(&["The Office (2005)"]);

        let show = identify(
            Path::new("/lib"),
            &d,
            "The Office - ",
            "The Office - S01E01",
        );

        assert_eq!(show.title, "The Office");
        assert_eq!(show.year, Some(2005));
    }

    #[test]
    fn a_bucket_folder_never_lends_its_year_to_a_show_it_does_not_name() {
        let d = dirs(&["all"]);

        let show = identify(
            Path::new("/lib"),
            &d,
            "Breaking.Bad.",
            "Breaking.Bad.S01E01",
        );

        assert_eq!(show.year, None);
    }

    #[test]
    fn a_stem_that_is_only_a_marker_survives_an_unnamed_root() {
        let show = identify(Path::new("/"), &[], "", "S01E01");

        assert_eq!(show.title, "S01E01");
    }
}
