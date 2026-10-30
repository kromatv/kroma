use serde_json::{json, Value};

use crate::db;
use crate::state::SharedState;
use crate::test_support::{seed_movie, seed_show_episode, FakeTmdb};

pub(super) const MOVIE_ID: &str = "m1";
pub(super) const SHOW_ID: &str = "s1";
pub(super) const EPISODE_ID: &str = "s1e1";
pub(super) const MOVIE_TMDB: u64 = 603;
pub(super) const SHOW_TMDB: u64 = 1396;

fn movie_detail() -> Value {
    json!({
        "id": MOVIE_TMDB,
        "title": "Title m1",
        "overview": "A hacker learns the truth.",
        "release_date": "1999-03-30",
        "imdb_id": "tt0133093",
        "genres": [{ "id": 28, "name": "Action" }],
        "credits": { "cast": [{ "id": 1, "name": "Keanu", "character": "Neo", "order": 0 }], "crew": [] },
    })
}

fn show_detail() -> Value {
    json!({
        "id": SHOW_TMDB,
        "name": "Show s1",
        "overview": "A teacher turns to crime.",
        "first_air_date": "2008-01-20",
        "genres": [{ "id": 18, "name": "Drama" }],
        "external_ids": { "imdb_id": "tt0903747" },
    })
}

fn season() -> Value {
    json!({
        "episodes": [
            { "episode_number": 1, "name": "Pilot", "overview": "It begins.", "air_date": "2008-01-20", "vote_average": 8.1 },
            { "episode_number": 2, "name": "Cat in the Bag", "overview": "Cleanup.", "air_date": "2008-01-27" },
        ],
        "credits": { "cast": [{ "id": 7, "name": "Bryan", "character": "Walter", "order": 0 }] },
    })
}

fn route(path: &str) -> (u16, Value) {
    match path {
        "/search/movie" => (
            200,
            json!({ "results": [{ "id": MOVIE_TMDB, "title": "Title m1", "vote_count": 100 }] }),
        ),
        "/search/tv" => (
            200,
            json!({ "results": [{ "id": SHOW_TMDB, "name": "Show s1", "vote_count": 100 }] }),
        ),
        "/movie/603" => (200, movie_detail()),
        "/tv/1396" => (200, show_detail()),
        "/tv/1396/season/1" => (200, season()),
        _ => (404, json!({})),
    }
}

pub(super) fn tmdb() -> FakeTmdb {
    FakeTmdb::start(route)
}

pub(super) fn shared_tmdb() -> FakeTmdb {
    FakeTmdb::start_shared(route)
}

pub(super) fn shared_tmdb_with_nothing_found() -> FakeTmdb {
    FakeTmdb::start_shared(nothing_found)
}

fn nothing_found(path: &str) -> (u16, Value) {
    match path {
        "/search/movie" | "/search/tv" => (200, json!({ "results": [] })),
        _ => (404, json!({})),
    }
}

pub(super) fn tmdb_with_nothing_found() -> FakeTmdb {
    FakeTmdb::start(nothing_found)
}

pub(super) fn state() -> SharedState {
    crate::test_support::test_state_with_tmdb("key")
}

pub(super) fn state_with_movie() -> SharedState {
    let state = state();
    seed_movie(&state, MOVIE_ID);
    state
}

pub(super) fn state_with_show() -> SharedState {
    let state = state();
    seed_show_episode(&state, SHOW_ID, EPISODE_ID);
    state
}

pub(super) fn tmdb_id_of_movie(state: &SharedState) -> Option<u64> {
    db::get_item(&state.db, MOVIE_ID)
        .unwrap()
        .and_then(|item| item.metadata)
        .map(|m| m.tmdb_id)
}

pub(super) fn tmdb_id_of_show(state: &SharedState) -> Option<u64> {
    db::list_shows(&state.db, None)
        .unwrap()
        .into_iter()
        .find(|s| s.id == SHOW_ID)
        .and_then(|s| s.metadata)
        .map(|m| m.tmdb_id)
}

pub(super) fn catalog(
    state: &SharedState,
) -> (Vec<crate::model::MediaItem>, Vec<crate::model::Show>) {
    (
        db::list_items(&state.db, None).unwrap(),
        db::list_shows(&state.db, None).unwrap(),
    )
}

pub(super) fn scanned(state: &SharedState) -> crate::services::scan::ScanData {
    let (items, shows) = catalog(state);
    let changed_shows = shows.iter().map(|s| s.id.clone()).collect();
    crate::services::scan::ScanData {
        items,
        shows,
        changed_shows,
        ..crate::services::scan::ScanData::default()
    }
}
