use std::fs::File;
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

use super::walk;
use crate::model::{Kind, MediaItem};
use crate::state::SharedState;
use crate::test_support::test_state;

const ATTIC: &str = "<movie><title>Tape three</title><plot>Found in the attic.</plot>\
                     <premiered>2004-06-01</premiered><genre>Family</genre></movie>";
const GARDEN: &str = "<movie><title>Tape four</title></movie>";

fn keep(root: &Path, file: &str, text: &str, modified: u64) {
    let path = root.join(file);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, text).unwrap();
    let file = File::options().write(true).open(&path).unwrap();
    file.set_modified(UNIX_EPOCH + Duration::from_secs(modified))
        .unwrap();
}

fn shown(state: &SharedState, kind: Kind) -> MediaItem {
    let mut items = crate::db::list_items(&state.db, None).unwrap();
    crate::db::localize::overlay_items(&state.db, &mut items, "en").unwrap();
    items.into_iter().find(|item| item.kind == kind).unwrap()
}

#[test]
fn a_film_the_provider_did_not_match_shows_the_text_of_its_nfo() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside");
    keep(root.path(), "tape.03/tape.03.mkv", "x", 1_000);
    keep(root.path(), "tape.03/tape.03.nfo", ATTIC, 1_000);

    walk(&state, root.path());

    let film = shown(&state, Kind::Movie);
    let meta = film.metadata.expect("a record for the file's summary");
    assert_eq!(film.title, "Tape three");
    assert_eq!(film.year, Some(2004));
    assert_eq!(meta.overview.as_deref(), Some("Found in the attic."));
    assert_eq!(meta.genres, vec!["Family".to_string()]);
}

#[test]
fn a_walk_reads_an_nfo_again_only_once_it_was_modified() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside-again");
    keep(root.path(), "tape.03/tape.03.mkv", "x", 1_000);
    keep(root.path(), "tape.03/movie.nfo", ATTIC, 1_000);
    walk(&state, root.path());

    keep(root.path(), "tape.03/movie.nfo", GARDEN, 1_000);
    walk(&state, root.path());
    let unchanged = shown(&state, Kind::Movie).title;
    keep(root.path(), "tape.03/movie.nfo", GARDEN, 2_000);
    walk(&state, root.path());
    let modified = shown(&state, Kind::Movie).title;

    assert_eq!(unchanged, "Tape three");
    assert_eq!(modified, "Tape four");
}

#[test]
fn a_show_takes_its_text_from_the_nfo_above_its_seasons() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside-show");
    keep(
        root.path(),
        "Our show/Season 01/Our show S01E01.mkv",
        "x",
        1_000,
    );
    let text = "<tvshow><title>Our very own show</title></tvshow>";
    keep(root.path(), "Our show/tvshow.nfo", text, 1_000);

    walk(&state, root.path());

    assert_eq!(
        shown(&state, Kind::Episode).show_title.as_deref(),
        Some("Our very own show")
    );
}
