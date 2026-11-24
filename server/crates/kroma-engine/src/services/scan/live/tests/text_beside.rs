use std::fs::File;
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

use super::walk;
use crate::db::imports::{Elsewhere, Lead};
use crate::db::metadata_core::ITEM;
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

#[test]
fn a_walk_keeps_the_tmdb_id_an_nfo_names_while_the_file_is_unchanged() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside-tmdb");
    keep(root.path(), "tape.03/tape.03.mkv", "x", 1_000);
    let named = r#"<movie><uniqueid type="tmdb">949</uniqueid></movie>"#;
    keep(root.path(), "tape.03/tape.03.nfo", named, 1_000);
    walk(&state, root.path());

    walk(&state, root.path());

    let film = shown(&state, Kind::Movie);
    let leads = crate::db::text_beside::leads(&state.db, ITEM).unwrap();
    assert_eq!(leads.get(&film.id), Some(&Lead::Tmdb(949)));
}

#[test]
fn a_walk_keeps_what_tmdb_answered_for_the_imdb_id_an_nfo_names_while_the_file_is_unchanged() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside-imdb");
    keep(root.path(), "tape.03/tape.03.mkv", "x", 1_000);
    let named = r#"<movie><uniqueid type="imdb">tt0113277</uniqueid></movie>"#;
    keep(root.path(), "tape.03/tape.03.nfo", named, 1_000);
    walk(&state, root.path());
    let asked = Elsewhere {
        imdb: Some("tt0113277".into()),
        tvdb: None,
    };
    crate::db::text_beside::answer(&state.db, ITEM, &asked, Some(949)).unwrap();

    walk(&state, root.path());

    let film = shown(&state, Kind::Movie);
    let leads = crate::db::text_beside::leads(&state.db, ITEM).unwrap();
    assert_eq!(leads.get(&film.id), Some(&Lead::Tmdb(949)));
}

#[test]
fn an_episode_shows_the_text_of_the_nfo_named_after_its_video() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-text-beside-episode");
    keep(root.path(), "Andor/Season 01/Andor S01E01.mkv", "x", 1_000);
    let pilot = "<episodedetails><title>Kassa</title><plot>A man looks for his sister.</plot>\
                 <aired>2022-09-21</aired></episodedetails>";
    keep(
        root.path(),
        "Andor/Season 01/Andor S01E01.nfo",
        pilot,
        1_000,
    );

    walk(&state, root.path());
    let row = shown(&state, Kind::Episode);
    let show = row.show_id.clone().unwrap();
    let mut detail = crate::db::get_show(&state.db, &show).unwrap().unwrap();
    crate::db::localize::overlay_show_detail(&state.db, &mut detail, "en").unwrap();

    let on_page = &detail.seasons[0].episodes[0];
    let meta = on_page.metadata.as_ref().expect("a record for the summary");
    assert_eq!(row.title, "Kassa");
    assert_eq!(on_page.title, "Kassa");
    assert_eq!(
        meta.overview.as_deref(),
        Some("A man looks for his sister.")
    );
    assert_eq!(meta.release_date.as_deref(), Some("2022-09-21"));
}
