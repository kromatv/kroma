use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{demo_item_id, get, seed_session, send, test_app};
use crate::model::Permission;

fn episode_two() -> Value {
    json!({
        "mount": "/api/module/tv.example.swarm",
        "id": "f13348a88094f2e1",
        "file": 1,
        "title": "Kaamelott",
        "poster": "https://image.tmdb.org/t/p/w500/k.jpg",
        "tmdbId": 11466,
        "season": 1,
        "episode": 2,
    })
}

fn watch_beat(session: &str, watch: Value) -> Value {
    json!({
        "sessionId": session,
        "watch": watch,
        "positionMs": 12_000,
        "durationMs": 70_000,
        "state": "playing",
        "mode": "remux",
    })
}

#[tokio::test]
async fn a_watch_download_beats_onto_the_dashboard_with_its_title() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(watch_beat("web-watch-1", episode_two())),
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, admin) = get(&t.app, "/api/admin/sessions", Some(&t.token)).await;
    let session = &admin["sessions"][0];
    assert_eq!(session["title"], "Kaamelott");
    assert_eq!(session["showTitle"], "Kaamelott");
    assert_eq!(session["kind"], "episode");
    assert_eq!(
        (&session["season"], &session["episode"]),
        (&json!(1), &json!(2))
    );
    assert_eq!(session["watch"], episode_two());
    assert_eq!(session["positionMs"], 12_000);
    assert!(session.get("itemId").is_none());
}

#[tokio::test]
async fn an_admin_stops_a_watch_session_as_it_stops_any_other() {
    let t = test_app();
    send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(watch_beat("web-watch-2", episode_two())),
    )
    .await;

    let (stopped, _) = send(
        &t.app,
        "POST",
        "/api/admin/sessions/web-watch-2/stop",
        Some(&t.token),
        Some(json!({ "message": "" })),
    )
    .await;

    assert_eq!(stopped, StatusCode::OK);
    let (_, admin) = get(&t.app, "/api/admin/sessions", Some(&t.token)).await;
    assert_eq!(admin["sessions"].as_array().map(Vec::len), Some(0));
    let (again, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(watch_beat("web-watch-2", episode_two())),
    )
    .await;
    assert_eq!(again, StatusCode::GONE);
}

#[tokio::test]
async fn a_beat_naming_both_a_title_and_a_download_is_refused() {
    let t = test_app();
    let mut both = watch_beat("web-both", episode_two());
    both["itemId"] = json!(demo_item_id("The Matrix"));

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(both),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_beat_naming_nothing_is_refused() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(json!({ "sessionId": "web-nothing", "positionMs": 0 })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_download_outside_the_shape_the_core_holds_is_refused() {
    let t = test_app();
    let mut watch = episode_two();
    watch["mount"] = json!("/api/../admin");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(watch_beat("web-escape", watch)),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_viewer_who_may_not_watch_downloads_cannot_report_one() {
    let t = test_app();
    let (_, member) = seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&member),
        Some(watch_beat("web-member", episode_two())),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    let (_, admin) = get(&t.app, "/api/admin/sessions", Some(&t.token)).await;
    assert_eq!(admin["sessions"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn an_oversized_beat_is_refused_before_it_is_parsed() {
    let t = test_app();
    let mut watch = episode_two();
    watch["title"] = json!("x".repeat(20_000));

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/playback/ping",
        Some(&t.token),
        Some(watch_beat("web-huge", watch)),
    )
    .await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
}
