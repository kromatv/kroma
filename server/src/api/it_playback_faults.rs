use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{demo_item_id, demo_show_id, get, send, test_app, TestApp};

fn sql(t: &TestApp, script: &str) {
    t.state.db.get().expect("a connection").execute_batch(script).expect("reshape the schema");
}

async fn refuses(t: &TestApp, method: &str, uri: &str, body: Option<serde_json::Value>) {
    let (status, _) = send(&t.app, method, uri, Some(&t.token), body).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{method} {uri}");
}

#[tokio::test]
async fn the_first_beat_pre_warms_the_subtitles_of_a_file_backed_item() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    t.state
        .db
        .get()
        .expect("a connection")
        .execute(
            "UPDATE files SET abs_path = ?2 WHERE item_id = ?1",
            rusqlite::params![item, "/nowhere/kroma/the-matrix.mkv"],
        )
        .expect("give the file a path an offline mount would have");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "sess-warm", "itemId": item, "positionMs": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let (_, admin) = get(&t.app, "/api/admin/sessions", Some(&t.token)).await;
    assert_eq!(admin["sessions"].as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn every_resume_position_refuses_when_the_progress_table_is_gone() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    let show = demo_show_id("Planet Earth II");
    sql(&t, "DROP TABLE progress");

    refuses(&t, "PUT", &format!("/api/progress/{item}"), Some(json!({ "positionMs": 1000 }))).await;
    refuses(&t, "DELETE", &format!("/api/progress/{item}"), None).await;
    refuses(&t, "GET", &format!("/api/progress/{item}"), None).await;
    refuses(&t, "GET", "/api/progress", None).await;
    refuses(&t, "GET", "/api/continue", None).await;
    refuses(&t, "GET", &format!("/api/shows/{show}/up-next"), None).await;
    refuses(&t, "PUT", &format!("/api/watched/{item}"), None).await;
}

#[tokio::test]
async fn the_watched_markers_and_the_list_refuse_when_their_tables_are_gone() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    sql(&t, "DROP TABLE watched; DROP TABLE my_list");

    refuses(&t, "DELETE", &format!("/api/watched/{item}"), None).await;
    refuses(&t, "GET", "/api/watched", None).await;
    refuses(&t, "PUT", &format!("/api/my-list/{item}"), None).await;
    refuses(&t, "DELETE", &format!("/api/my-list/{item}"), None).await;
    refuses(&t, "GET", "/api/my-list", None).await;
}

#[tokio::test]
async fn the_episode_walk_refuses_when_the_catalog_cannot_be_hydrated() {
    let t = test_app();
    let ep = demo_item_id("Islands");
    sql(&t, "ALTER TABLE items RENAME COLUMN title TO title_gone");

    refuses(&t, "GET", &format!("/api/items/{ep}/next"), None).await;
    refuses(&t, "GET", &format!("/api/items/{ep}/following"), None).await;
}

#[tokio::test]
async fn the_recommended_rows_refuse_when_their_source_tables_are_gone() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    sql(&t, "DROP TABLE item_vectors; DROP TABLE play_history");

    refuses(&t, "GET", "/api/for-you", None).await;
    refuses(&t, "GET", &format!("/api/items/{item}/similar"), None).await;
    refuses(&t, "GET", "/api/themed?q=heist", None).await;
}
