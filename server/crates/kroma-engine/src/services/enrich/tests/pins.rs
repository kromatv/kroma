use std::collections::HashSet;

use serde_json::{Value, json};

use super::super::enrich_one;
use super::super::jobs::build_jobs;
use super::super::pins::load_pins;
use super::support::*;
use crate::db;
use crate::db::imports::{Elsewhere, FileIdentity, HeldIds, Lead, NewImport, Subject};
use crate::db::metadata_core::ITEM;
use crate::model::imports::{Origin, Selection};
use crate::state::SharedState;
use crate::test_support::{FakeTmdb, seed_movie};

const HEAT: u64 = 949;
const THE_WIRE: u64 = 1438;
const BY_HAND: u64 = 11;
const MOVIE_FILE: &str = "/media/m1.mkv";
const EPISODE_FILE: &str = "/media/s1e1.mkv";
const HEAT_ON_IMDB: &str = "tt0113277";
const WHILE_TMDB_IS_DOWN: &str = "tt0000002";

fn catalogue(path: &str) -> (u16, Value) {
    match path {
        "/search/movie" => (
            200,
            json!({ "results": [{ "id": MOVIE_TMDB, "title": "Title m1" }] }),
        ),
        "/search/tv" => (
            200,
            json!({ "results": [{ "id": SHOW_TMDB, "name": "Show s1" }] }),
        ),
        "/movie/603" => (200, json!({ "id": MOVIE_TMDB, "title": "Title m1" })),
        "/movie/949" => (200, json!({ "id": HEAT, "title": "Heat" })),
        "/movie/11" => (200, json!({ "id": BY_HAND, "title": "Star Wars" })),
        "/tv/1396" => (200, json!({ "id": SHOW_TMDB, "name": "Show s1" })),
        "/tv/1438" => (200, json!({ "id": THE_WIRE, "name": "The Wire" })),
        "/find/tt0113277" => (200, json!({ "movie_results": [{ "id": HEAT }] })),
        "/find/79126" => (200, json!({ "tv_results": [{ "id": THE_WIRE }] })),
        _ => (404, json!({})),
    }
}

fn by_tmdb(tmdb: u64) -> HeldIds {
    HeldIds {
        tmdb: Some(tmdb),
        ..Default::default()
    }
}

fn by_imdb(imdb: &str) -> HeldIds {
    HeldIds {
        tmdb: None,
        elsewhere: Elsewhere {
            imdb: Some(imdb.into()),
            tvdb: None,
        },
    }
}

fn by_tvdb(tvdb: u64) -> HeldIds {
    HeldIds {
        tmdb: None,
        elsewhere: Elsewhere {
            imdb: None,
            tvdb: Some(tvdb),
        },
    }
}

fn an_import_kept(state: &SharedState, files: &[(&str, Subject, HeldIds)]) {
    let server = Origin {
        id: "srv".into(),
        name: String::new(),
    };
    let new = NewImport {
        id: "i1",
        importer: "tv.x.import",
        server: &server,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by: None,
        created_ms: 1,
    };
    db::imports::queue(&state.db, &new).unwrap();
    let identities: Vec<FileIdentity> = files
        .iter()
        .map(|(path, subject, ids)| FileIdentity {
            path: (*path).into(),
            subject: *subject,
            ids: ids.clone(),
        })
        .collect();
    let server_id = db::imports::server_key("tv.x.import", "srv");
    db::imports::keep_identities(&state.db, &server_id, &identities).unwrap();
}

fn lead_of_the_movie(state: &SharedState) -> Option<Lead> {
    let conn = state.db.get().unwrap();
    db::imports::identity_lead(&conn, Subject::Movie, MOVIE_ID).unwrap()
}

#[test]
fn enrich_one_takes_an_imported_identity_over_the_search() {
    let tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    an_import_kept(&state, &[(MOVIE_FILE, Subject::Movie, by_tmdb(HEAT))]);

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(HEAT));
    assert!(tmdb.requests().iter().all(|r| !r.starts_with("/search")));
}

#[test]
fn enrich_one_takes_a_match_made_by_hand_over_an_imported_identity() {
    let _tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    an_import_kept(
        &state,
        &[(MOVIE_FILE, Subject::Movie, by_imdb(HEAT_ON_IMDB))],
    );
    db::tmdb_pin::set(&state.db, ITEM, MOVIE_ID, BY_HAND).unwrap();

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(BY_HAND));
}

#[test]
fn enrich_one_takes_what_an_acquisition_knows_over_an_imported_identity() {
    let _tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    an_import_kept(&state, &[(MOVIE_FILE, Subject::Movie, by_tmdb(HEAT))]);
    db::set_file_tmdb(&state.db, MOVIE_FILE, MOVIE_TMDB).unwrap();

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
}

#[test]
fn enrich_one_asks_tmdb_which_show_a_tvdb_id_names_and_keeps_the_answer() {
    let tmdb = FakeTmdb::start(catalogue);
    let state = state_with_show();
    an_import_kept(&state, &[(EPISODE_FILE, Subject::Show, by_tvdb(79126))]);

    enrich_one(&state, SHOW_ID, true).unwrap();

    let conn = state.db.get().unwrap();
    let lead = db::imports::identity_lead(&conn, Subject::Show, SHOW_ID).unwrap();
    assert_eq!(tmdb_id_of_show(&state), Some(THE_WIRE));
    assert_eq!(lead, Some(Lead::Tmdb(THE_WIRE)));
    assert!(tmdb.requests().iter().all(|r| !r.starts_with("/search")));
}

#[test]
fn a_request_tmdb_did_not_answer_leaves_the_identity_to_ask_about_again() {
    let _tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    let unanswered = by_imdb(WHILE_TMDB_IS_DOWN);
    an_import_kept(&state, &[(MOVIE_FILE, Subject::Movie, unanswered.clone())]);

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
    assert_eq!(
        lead_of_the_movie(&state),
        Some(Lead::Ask(unanswered.elsewhere))
    );
}

#[test]
fn a_match_by_hand_and_an_acquisition_each_come_ahead_of_an_imported_identity() {
    let state = state();
    for id in ["m1", "m2", "m3"] {
        seed_movie(&state, id);
    }
    let kept = ["/media/m1.mkv", "/media/m2.mkv", "/media/m3.mkv"]
        .map(|file| (file, Subject::Movie, by_tmdb(HEAT)));
    an_import_kept(&state, &kept);
    db::set_file_tmdb(&state.db, "/media/m2.mkv", MOVIE_TMDB).unwrap();
    db::tmdb_pin::set(&state.db, ITEM, "m3", BY_HAND).unwrap();

    let pins = load_pins(&state.db);

    assert_eq!(pins.items["m1"], HEAT);
    assert_eq!(pins.items["m2"], MOVIE_TMDB);
    assert_eq!(pins.items["m3"], BY_HAND);
}

#[test]
fn tmdb_is_asked_about_an_identity_only_where_nothing_else_names_an_id() {
    let state = state();
    for id in ["m1", "m2", "m3"] {
        seed_movie(&state, id);
    }
    let kept = ["/media/m1.mkv", "/media/m2.mkv", "/media/m3.mkv"]
        .map(|file| (file, Subject::Movie, by_imdb(HEAT_ON_IMDB)));
    an_import_kept(&state, &kept);
    db::set_file_tmdb(&state.db, "/media/m2.mkv", MOVIE_TMDB).unwrap();
    db::tmdb_pin::set(&state.db, ITEM, "m3", BY_HAND).unwrap();

    let pins = load_pins(&state.db);

    let unasked: Vec<&String> = pins.unasked_items.keys().collect();
    assert_eq!(unasked, vec!["m1"]);
}

#[test]
fn a_title_matched_on_file_is_fetched_again_while_its_identity_is_to_ask_about() {
    let _tmdb = FakeTmdb::start(catalogue);
    let state = state_with_movie();
    enrich_one(&state, MOVIE_ID, false).unwrap();
    an_import_kept(
        &state,
        &[(MOVIE_FILE, Subject::Movie, by_imdb(HEAT_ON_IMDB))],
    );
    let (items, shows) = catalog(&state);

    let jobs = build_jobs(
        &items,
        &shows,
        &load_pins(&state.db),
        &state.config.data_dir,
    );

    assert!(jobs[0].fetches(&HashSet::new()));
    assert_eq!(jobs[0].resolved_tmdb, None);
    assert_eq!(jobs[0].refetch, Some(MOVIE_TMDB));
    assert_eq!(jobs[0].pin, None);
}
