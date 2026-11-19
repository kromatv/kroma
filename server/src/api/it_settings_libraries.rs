//! `PUT /api/admin/settings` and the `libraries` key: the endpoint saves a
//! list, and is never a way to remove a library the index holds.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{send, test_app, TestApp};
use crate::services::scan::{rescan_sync, uninterrupted, WalkTurn};

const RESUME_MS: i64 = 60_000;

async fn put_settings(t: &TestApp, patch: serde_json::Value) -> (StatusCode, serde_json::Value) {
    send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(patch),
    )
    .await
}

fn owners_list(root: &std::path::Path) -> serde_json::Value {
    json!([{
        "id": "lib-owner",
        "name": "Films",
        "kind": "movies",
        "folders": [root.to_string_lossy()],
        "autoScan": true,
    }])
}

fn a_library_with_a_film_the_owner_stopped_in(t: &TestApp, root: &std::path::Path) -> String {
    std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();
    let defs =
        serde_json::from_value::<Vec<crate::services::settings::LibraryDef>>(owners_list(root));
    crate::services::settings::set_library_defs(&t.state.settings, &t.state.db, &defs.unwrap());
    rescan_sync(&WalkTurn::wait(), &t.state, &mut uninterrupted).unwrap();
    let film = crate::db::list_items(&t.state.db, None)
        .unwrap()
        .remove(0)
        .id;
    crate::db::upsert_progress(&t.state.db, &t.user_id, &film, RESUME_MS, None).unwrap();
    film
}

fn the_stored_row_stops_being_json(t: &TestApp) {
    t.state
        .db
        .get()
        .unwrap()
        .execute(
            "UPDATE settings SET value = '[{' WHERE key = 'libraries'",
            [],
        )
        .unwrap();
    t.state.settings.reload(&t.state.db);
}

fn kept(t: &TestApp, film: &str) -> (bool, Option<i64>) {
    let library = crate::db::list_libraries(&t.state.db)
        .unwrap()
        .iter()
        .any(|library| library.id == "lib-owner");
    let resume = crate::db::get_progress(&t.state.db, &t.user_id, film)
        .unwrap()
        .map(|entry| entry.position_ms);
    (library, resume)
}

struct WayOut {
    status: StatusCode,
    scan_failed_before: bool,
    scan_fails_after: bool,
    kept: (bool, Option<i64>),
}

async fn saved_over_a_list_that_cannot_be_read(
    way_out: impl FnOnce(&std::path::Path) -> serde_json::Value,
) -> WayOut {
    let t = test_app();
    let root = kroma_testing::temp_dir("settings-way-out");
    let film = a_library_with_a_film_the_owner_stopped_in(&t, root.path());
    the_stored_row_stops_being_json(&t);
    let scan_failed_before = rescan_sync(&WalkTurn::wait(), &t.state, &mut uninterrupted).is_err();

    let (status, _) = put_settings(&t, json!({ "libraries": way_out(root.path()) })).await;
    let scan_fails_after = rescan_sync(&WalkTurn::wait(), &t.state, &mut uninterrupted).is_err();

    WayOut {
        status,
        scan_failed_before,
        scan_fails_after,
        kept: kept(&t, &film),
    }
}

#[tokio::test]
async fn a_null_put_over_a_list_that_cannot_be_read_is_refused_and_keeps_the_library() {
    let outcome = saved_over_a_list_that_cannot_be_read(|_| json!(null)).await;

    assert_eq!(outcome.status, StatusCode::BAD_REQUEST);
    assert!(outcome.scan_failed_before && outcome.scan_fails_after);
    assert_eq!(outcome.kept, (true, Some(RESUME_MS)));
}

#[tokio::test]
async fn an_empty_list_put_over_a_list_that_cannot_be_read_is_refused_and_keeps_the_library() {
    let outcome = saved_over_a_list_that_cannot_be_read(|_| json!([])).await;

    assert_eq!(outcome.status, StatusCode::BAD_REQUEST);
    assert!(outcome.scan_failed_before && outcome.scan_fails_after);
    assert_eq!(outcome.kept, (true, Some(RESUME_MS)));
}

#[tokio::test]
async fn the_same_list_put_again_with_its_ids_is_the_way_out_of_a_list_that_cannot_be_read() {
    let outcome = saved_over_a_list_that_cannot_be_read(owners_list).await;

    assert_eq!(outcome.status, StatusCode::OK);
    assert!(outcome.scan_failed_before && !outcome.scan_fails_after);
    assert_eq!(outcome.kept, (true, Some(RESUME_MS)));
}

#[tokio::test]
async fn the_libraries_page_names_the_library_to_keep_when_the_list_cannot_be_read() {
    let t = test_app();
    let root = kroma_testing::temp_dir("settings-names-the-way-out");
    a_library_with_a_film_the_owner_stopped_in(&t, root.path());
    the_stored_row_stops_being_json(&t);

    let (listed, answer) = send(&t.app, "GET", "/api/admin/libraries", Some(&t.token), None).await;
    let (catalogue, body) = send(&t.app, "GET", "/api/libraries", Some(&t.token), None).await;

    assert_eq!(listed, StatusCode::CONFLICT);
    assert_eq!(answer["code"], "error.libraryListUnreadableKeep");
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.contains("Films (lib-owner)")));
    assert_eq!(catalogue, StatusCode::OK);
    assert!(body.to_string().contains("lib-owner"), "{body}");
}

#[tokio::test]
async fn a_list_that_leaves_out_a_held_library_is_refused_by_name_and_writes_no_key() {
    let t = test_app();
    let root = kroma_testing::temp_dir("settings-left-out");
    let film = a_library_with_a_film_the_owner_stopped_in(&t, root.path());
    let saved = t.state.settings.get("libraries");
    let other = json!([{ "id": "lib-other", "name": "Shows", "folders": ["/media/shows"] }]);

    let (status, answer) =
        put_settings(&t, json!({ "libraries": other, "serverName": "Renamed" })).await;
    rescan_sync(&WalkTurn::wait(), &t.state, &mut uninterrupted).unwrap();

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(answer["code"], "error.librariesLeftOut");
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.contains("Films (lib-owner)")));
    assert_eq!(t.state.settings.get("libraries"), saved);
    assert_eq!(t.state.settings.get("serverName"), json!("KROMA"));
    assert_eq!(kept(&t, &film), (true, Some(RESUME_MS)));
}

#[tokio::test]
async fn the_refusal_is_said_in_the_language_of_the_account() {
    let t = test_app();
    let root = kroma_testing::temp_dir("settings-left-out-fr");
    a_library_with_a_film_the_owner_stopped_in(&t, root.path());
    t.state
        .db
        .get()
        .unwrap()
        .execute(
            "UPDATE users SET language = 'fr' WHERE id = ?1",
            [&t.user_id],
        )
        .unwrap();

    let (status, answer) = put_settings(&t, json!({ "libraries": [] })).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(answer["error"]
        .as_str()
        .is_some_and(|error| error.starts_with("Impossible d'enregistrer cette liste")));
}

#[tokio::test]
async fn a_libraries_value_that_is_not_a_list_of_libraries_is_refused_and_writes_no_key() {
    let t = test_app();
    let saved = t.state.settings.get("libraries");

    let (status, answer) = put_settings(
        &t,
        json!({ "libraries": [{ "name": "Films" }], "serverName": "Renamed" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(answer["code"], "error.librariesNotAList");
    assert_eq!(t.state.settings.get("libraries"), saved);
    assert_eq!(t.state.settings.get("serverName"), json!("KROMA"));
}

#[tokio::test]
async fn a_list_is_saved_beside_the_demo_libraries_which_are_nobodys_to_keep() {
    let t = test_app();
    let list = json!([{ "id": "lib-1", "name": "Films", "folders": ["/media/films"] }]);

    let (status, body) = put_settings(&t, json!({ "libraries": list })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["updated"], json!(["libraries"]));
    assert_eq!(t.state.settings.get("libraries"), list);
}
