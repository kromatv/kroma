use serde_json::json;

use super::*;
use crate::db::metadata_core::ITEM;
use crate::db::title_edits::{self, Title};
use crate::model::title_edit::{Actor, TitleEdit};
use crate::test_support::{seed_movie, test_state, test_state_with_tmdb, FakeTmdb};

fn played(state: &SharedState, names: &[&str]) {
    let actor = |name: &&str| Actor {
        name: name.to_string(),
        role: None,
    };
    let edit = TitleEdit {
        cast: Some(names.iter().map(actor).collect()),
        ..Default::default()
    };
    seed_movie(state, "m1");
    title_edits::write(
        &state.db,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &edit,
    )
    .unwrap();
}

fn knowing_jane() -> FakeTmdb {
    FakeTmdb::start(|path| match path {
        "/search/person" => (
            200,
            json!({ "results": [{ "id": 42, "name": "Jane Doe", "profile_path": null }] }),
        ),
        _ => (404, json!({})),
    })
}

#[test]
fn each_name_written_is_asked_about_once_and_what_tmdb_said_is_kept() {
    let state = test_state_with_tmdb("key");
    played(&state, &["Jane Doe", "Nobody Known"]);
    let tmdb = knowing_jane();

    let first = match_written(&state, &|| false).unwrap();
    let again = match_written(&state, &|| false).unwrap();

    assert_eq!(first, Pass { asked: 2, found: 1 });
    assert_eq!(again, Pass::default());
    assert_eq!(tmdb.requests().len(), 2);
}

#[test]
fn a_server_without_a_tmdb_key_asks_nobody() {
    let state = test_state();
    played(&state, &["Jane Doe"]);

    let pass = match_written(&state, &|| false).unwrap();

    assert_eq!(pass, Pass::default());
}

#[test]
fn a_pass_cancelled_asks_nobody_more() {
    let state = test_state_with_tmdb("key");
    played(&state, &["Jane Doe"]);
    let tmdb = knowing_jane();

    let pass = match_written(&state, &|| true).unwrap();

    assert_eq!(pass, Pass::default());
    assert!(tmdb.requests().is_empty());
}

#[test]
fn tmdb_out_of_reach_stops_the_pass_and_the_name_is_asked_about_later() {
    let state = test_state_with_tmdb("key");
    played(&state, &["Jane Doe"]);
    let _tmdb = FakeTmdb::start(|_| (500, json!({})));

    let pass = match_written(&state, &|| false);

    assert!(pass.is_err());
    let left = crate::db::people_found::unsearched(&state.db, 0).unwrap();
    assert_eq!(left, ["Jane Doe"]);
}
