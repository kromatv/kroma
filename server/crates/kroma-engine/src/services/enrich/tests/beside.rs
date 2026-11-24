use super::super::enrich_one;
use super::super::pins::load_pins;
use super::held::*;
use super::support::*;
use crate::db;
use crate::db::imports::Subject;
use crate::db::metadata_core::{ITEM, SHOW};
use crate::test_support::{FakeTmdb, seed_movie};

#[test]
fn enrich_one_matches_a_film_to_the_tmdb_id_its_nfo_names_without_a_search() {
    let tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    files_beside_name(&state, &[(ITEM, MOVIE_ID, HEAT)]);

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(HEAT));
    assert!(tmdb.requests().iter().all(|r| !r.starts_with("/search")));
}

#[test]
fn a_show_matched_by_its_name_is_matched_again_to_the_id_its_nfo_names() {
    let _tmdb = FakeTmdb::start(catalogue);
    let state = state_with_show();
    enrich_one(&state, SHOW_ID, true).unwrap();
    files_beside_name(&state, &[(SHOW, SHOW_ID, THE_WIRE)]);

    enrich_one(&state, SHOW_ID, true).unwrap();

    assert_eq!(tmdb_id_of_show(&state), Some(THE_WIRE));
}

#[test]
fn enrich_one_takes_the_id_an_nfo_names_over_an_imported_one_still_to_ask_about() {
    let tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    an_import_kept(
        &state,
        &[(MOVIE_FILE, Subject::Movie, by_imdb(WHILE_TMDB_IS_DOWN))],
    );
    files_beside_name(&state, &[(ITEM, MOVIE_ID, HEAT)]);

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(HEAT));
    assert!(tmdb.requests().iter().all(|r| !r.starts_with("/find")));
}

#[test]
fn a_match_by_hand_an_acquisition_and_an_import_each_come_ahead_of_an_nfo() {
    let state = state();
    for id in ["m1", "m2", "m3", "m4"] {
        seed_movie(&state, id);
    }
    let named = ["m1", "m2", "m3", "m4"].map(|id| (ITEM, id, HEAT));
    files_beside_name(&state, &named);
    an_import_kept(
        &state,
        &[("/media/m2.mkv", Subject::Movie, by_tmdb(THE_WIRE))],
    );
    db::set_file_tmdb(&state.db, "/media/m3.mkv", MOVIE_TMDB).unwrap();
    db::tmdb_pin::set(&state.db, ITEM, "m4", BY_HAND).unwrap();

    let pins = load_pins(&state.db);

    assert_eq!(pins.items["m1"], HEAT);
    assert_eq!(pins.items["m2"], THE_WIRE);
    assert_eq!(pins.items["m3"], MOVIE_TMDB);
    assert_eq!(pins.items["m4"], BY_HAND);
}

#[test]
fn tmdb_is_not_asked_about_an_imported_identity_where_an_nfo_names_an_id() {
    let state = state();
    seed_movie(&state, "m1");
    an_import_kept(
        &state,
        &[("/media/m1.mkv", Subject::Movie, by_imdb(HEAT_ON_IMDB))],
    );
    files_beside_name(&state, &[(ITEM, "m1", HEAT)]);

    let pins = load_pins(&state.db);

    assert_eq!(pins.items["m1"], HEAT);
    assert!(pins.unasked_items.is_empty());
}
