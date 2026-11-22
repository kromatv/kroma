use serde_json::{json, Value};

use super::*;
use crate::db;
use crate::test_support::{seed_movie, seed_show_episode, test_state_with_tmdb, FakeTmdb};

fn legacy(tmdb_id: u64, certification: &str) -> Metadata {
    let mut meta: Metadata = serde_json::from_value(json!({
        "tmdbId": tmdb_id,
        "title": "En eaux très troubles",
        "overview": null,
        "genres": [],
        "tmdbUrl": "",
    }))
    .unwrap();
    meta.certification = Some(certification.into());
    meta
}

fn meg_2_rated() -> Value {
    json!({ "results": [
        { "iso_3166_1": "FR", "release_dates": [{ "certification": "TP" }] },
        { "iso_3166_1": "CH", "release_dates": [{ "certification": "12" }] },
        { "iso_3166_1": "US", "release_dates": [{ "certification": "PG-13" }] },
    ]})
}

fn context(state: &SharedState) -> JobContext {
    JobContext::for_test(state.clone())
}

#[test]
fn only_a_title_with_no_country_kept_is_queued() {
    let state = test_state_with_tmdb("test-key");
    seed_movie(&state, "old");
    seed_movie(&state, "new");
    db::set_item_metadata(&state.db, "old", &legacy(615656, "TP")).unwrap();
    let mut rated = legacy(603, "R");
    rated.ratings.insert("US".into(), "R".into());
    db::set_item_metadata(&state.db, "new", &rated).unwrap();

    let queued = enumerate(&state).unwrap();

    assert_eq!(queued, vec![("old".to_string(), "tmdb:615656".to_string())]);
}

#[test]
fn a_title_enriched_before_every_country_was_kept_gains_them() {
    let state = test_state_with_tmdb("test-key");
    seed_movie(&state, "meg");
    db::set_item_metadata(&state.db, "meg", &legacy(615656, "TP")).unwrap();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/movie/615656/release_dates" => (200, meg_2_rated()),
        _ => (404, json!({})),
    });

    process(&context(&state), "meg").unwrap();

    let stored = db::get_item(&state.db, "meg").unwrap().unwrap().metadata.unwrap();
    assert_eq!(stored.ratings.get("CH").map(String::as_str), Some("12"));
    assert_eq!(stored.ratings.len(), 3);
}

#[test]
fn a_show_gains_every_countrys_label_from_its_content_ratings() {
    let state = test_state_with_tmdb("test-key");
    seed_show_episode(&state, "show", "ep");
    db::set_show_metadata(&state.db, "show", &legacy(1396, "TV-MA")).unwrap();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/1396/content_ratings" => (
            200,
            json!({ "results": [{ "iso_3166_1": "CH", "rating": "16" }] }),
        ),
        _ => (404, json!({})),
    });

    process(&context(&state), "show").unwrap();

    let stored = db::show_metadata(&state.db, "show").unwrap().unwrap();
    assert_eq!(stored.ratings.get("CH").map(String::as_str), Some("16"));
}

#[test]
fn a_title_nobody_rated_keeps_what_it_had() {
    let state = test_state_with_tmdb("test-key");
    seed_movie(&state, "home");
    db::set_item_metadata(&state.db, "home", &legacy(42, "TP")).unwrap();
    let _tmdb = FakeTmdb::start(|_| (200, json!({ "results": [] })));

    process(&context(&state), "home").unwrap();

    let stored = db::get_item(&state.db, "home").unwrap().unwrap().metadata.unwrap();
    assert!(stored.ratings.is_empty());
    assert_eq!(stored.certification.as_deref(), Some("TP"));
}

#[test]
fn a_provider_that_does_not_answer_leaves_the_title_for_the_next_try() {
    let state = test_state_with_tmdb("test-key");
    seed_movie(&state, "meg");
    db::set_item_metadata(&state.db, "meg", &legacy(615656, "TP")).unwrap();
    let _tmdb = FakeTmdb::start(|_| (500, json!({ "status_message": "boom" })));

    let failed = process(&context(&state), "meg");

    assert!(failed.is_err());
    assert!(enumerate(&state).unwrap().iter().any(|(id, _)| id == "meg"));
}

#[test]
fn a_server_without_a_metadata_key_and_a_title_never_matched_ask_nothing() {
    let keyless = crate::test_support::test_state();
    seed_movie(&keyless, "meg");
    db::set_item_metadata(&keyless.db, "meg", &legacy(615656, "TP")).unwrap();
    let state = test_state_with_tmdb("test-key");
    seed_movie(&state, "bare");

    process(&context(&keyless), "meg").unwrap();
    process(&context(&state), "bare").unwrap();

    let stored = db::get_item(&keyless.db, "meg").unwrap().unwrap().metadata.unwrap();
    assert!(stored.ratings.is_empty());
    assert!(enumerate(&state).unwrap().is_empty());
}
