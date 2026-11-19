//! Integration tests for the plays an import brought, as the watch-history
//! screen and the dashboard read them over HTTP.

use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{IMPORTER, TestApp, get, test_app};
use crate::db;
use crate::db::imports::{Added, NewImport, NewPlay, Place};
use crate::model::PlayRecord;
use crate::model::imports::{Origin, Selection};

const TWO_HOURS_MS: i64 = 7_200_000;

fn an_hour_ago() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() - 3600
}

fn a_film_that_runs_two_hours(t: &TestApp) -> String {
    let conn = t.state.db.get().unwrap();
    let film: String = conn
        .query_row(
            "SELECT id FROM items WHERE kind = 'movie' ORDER BY id LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    conn.execute(
        "UPDATE items SET duration_ms = CAST(?2 AS INTEGER) WHERE id = ?1",
        [film.clone(), TWO_HOURS_MS.to_string()],
    )
    .unwrap();
    film
}

fn an_import_brought_a_play_of(t: &TestApp, film: &str) {
    let living_room = Origin {
        id: "srv".into(),
        name: "Living room".into(),
    };
    let import = NewImport {
        id: "i1",
        importer: IMPORTER,
        server: &living_room,
        sign_in: "s-1",
        selection: &Selection::default(),
        started_by: None,
        created_ms: 1,
    };
    assert!(db::imports::queue(&t.state.db, &import).unwrap());
    let play = NewPlay {
        id: "p1",
        account: &t.user_id,
        place: Place::Title(film),
        played_at: an_hour_ago(),
        duration_ms: None,
    };
    let server = db::imports::server_key(IMPORTER, "srv");
    let added = db::imports::add_plays(&t.state.db, &server, &[play]).unwrap();
    assert_eq!(added, [Added::New]);
}

async fn watch_history(t: &TestApp) -> Value {
    let (status, page) = get(&t.app, "/api/admin/stats/plays", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    page
}

#[tokio::test]
async fn watch_history_says_a_play_was_imported_and_names_the_server_it_came_from() {
    let t = test_app();
    let film = a_film_that_runs_two_hours(&t);
    an_import_brought_a_play_of(&t, &film);

    let page = watch_history(&t).await;

    let row = &page["plays"][0];
    assert_eq!(page["total"], 1);
    assert_eq!(row["userId"], json!(t.user_id));
    assert_eq!(row["itemId"], json!(film));
    assert_eq!(
        row["importedFrom"],
        json!({ "importer": IMPORTER, "name": "Living room" })
    );
}

#[tokio::test]
async fn an_imported_row_leaves_its_device_its_player_its_mode_and_its_network_blank() {
    let t = test_app();
    let film = a_film_that_runs_two_hours(&t);
    an_import_brought_a_play_of(&t, &film);

    let page = watch_history(&t).await;

    let row = &page["plays"][0];
    assert_eq!(
        json!([row["device"], row["player"], row["mode"], row["network"]]),
        json!([null, null, null, null])
    );
}

#[tokio::test]
async fn an_imported_row_with_no_duration_shows_the_runtime_and_says_so() {
    let t = test_app();
    let film = a_film_that_runs_two_hours(&t);
    an_import_brought_a_play_of(&t, &film);

    let page = watch_history(&t).await;

    let row = &page["plays"][0];
    assert_eq!(row["watchedMs"], TWO_HOURS_MS);
    assert_eq!(row["watchedIsRuntime"], true);
}

#[tokio::test]
async fn the_dashboard_counts_an_imported_play_at_the_runtime_of_its_title() {
    let t = test_app();
    let film = a_film_that_runs_two_hours(&t);
    an_import_brought_a_play_of(&t, &film);

    let (_, viewers) = get(&t.app, "/api/admin/stats/top-users", Some(&t.token)).await;
    let (_, chart) = get(&t.app, "/api/admin/stats/history", Some(&t.token)).await;

    let owner = viewers["users"]
        .as_array()
        .unwrap()
        .iter()
        .find(|viewer| viewer["userId"] == json!(t.user_id))
        .unwrap();
    assert_eq!(owner["watchedMs"], TWO_HOURS_MS);
    assert_eq!(owner["plays"], 1);
    assert_eq!(chart["totalFilmsMs"], TWO_HOURS_MS);
}

#[tokio::test]
async fn a_play_of_this_server_names_no_other_server() {
    let t = test_app();
    let play = PlayRecord {
        user_id: Some(t.user_id.clone()),
        username: Some("owner".into()),
        kind: "movie".into(),
        title: "Heat".into(),
        started_at: an_hour_ago(),
        ended_at: an_hour_ago(),
        watched_ms: 60_000,
        ..Default::default()
    };
    db::record_play(&t.state.db, &play).unwrap();

    let page = watch_history(&t).await;

    let row = &page["plays"][0];
    assert_eq!(row["importedFrom"], Value::Null);
    assert_eq!(row["watchedIsRuntime"], false);
    assert_eq!(row["watchedMs"], 60_000);
}
