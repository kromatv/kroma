use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{TestApp, get, seed_session, send, test_app};
use crate::db;
use crate::model::{MinAvailability, MonitoredTitle, Permission, RequestKind};

fn admin(t: &TestApp) -> String {
    seed_session(
        &t.state,
        "lib@test.dev",
        "librarian",
        &[Permission::LibraryManage],
    )
    .1
}

fn viewer(t: &TestApp) -> String {
    seed_session(&t.state, "view@test.dev", "viewer", &[Permission::Playback]).1
}

fn seed_monitored(t: &TestApp, tmdb_id: u64) {
    db::upsert_monitored(
        &t.state.db,
        &MonitoredTitle {
            kind: RequestKind::Show,
            tmdb_id,
            title: "Severance".into(),
            year: Some(2022),
            poster_url: None,
            seasons: vec![1],
            monitor_new_seasons: true,
            min_availability: MinAvailability::Released,
            last_season: Some(1),
            added_by: None,
            added_at: 1,
            updated_at: 1,
            original_language: Some("en-US".into()),
            air_status: None,
            refreshed_at: None,
            known_episodes: Default::default(),
            aliases: Vec::new(),
        },
    )
    .unwrap();
    let row = db::WantedRow {
        id: db::unit_id("episode", tmdb_id, Some(1), Some(1)),
        request_id: None,
        kind: "episode".into(),
        tmdb_id,
        imdb_id: None,
        title: "Severance".into(),
        year: None,
        season: Some(1),
        episode: Some(1),
        air_date: Some("2022-02-18".into()),
        status: "wanted".into(),
        last_search_at: None,
    };
    db::insert_wanted(&t.state.db, &[row], 1).unwrap();
}

#[tokio::test]
async fn monitoring_is_for_library_managers_only() {
    let t = test_app();
    let token = viewer(&t);

    let (status, _) = get(&t.app, "/api/monitoring", Some(&token)).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn the_list_tallies_each_monitored_title() {
    let t = test_app();
    let token = admin(&t);
    seed_monitored(&t, 95396);

    let (status, body) = get(&t.app, "/api/monitoring", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body[0]["title"], json!("Severance"));
    assert_eq!(body[0]["tmdbId"], json!(95396));
    assert_eq!(body[0]["missing"], json!(1));
    assert_eq!(body[0]["seasons"], json!([1]));
    assert!(body[0].get("knownEpisodes").is_none());
}

#[tokio::test]
async fn a_title_nobody_monitors_is_not_found() {
    let t = test_app();
    let token = admin(&t);

    let (status, _) = get(&t.app, "/api/monitoring/show/1", Some(&token)).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_monitored_title_is_read_back() {
    let t = test_app();
    let token = admin(&t);
    seed_monitored(&t, 95396);

    let (status, body) = get(&t.app, "/api/monitoring/show/95396", Some(&token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["monitorNewSeasons"], json!(true));
    assert_eq!(body["minAvailability"], json!("released"));
}

#[tokio::test]
async fn an_unknown_kind_is_refused() {
    let t = test_app();
    let token = admin(&t);

    let (status, _) = get(&t.app, "/api/monitoring/album/1", Some(&token)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unmonitoring_drops_the_title_and_says_whether_it_was_there() {
    let t = test_app();
    let token = admin(&t);
    seed_monitored(&t, 95396);

    let (_, first) = send(
        &t.app,
        "DELETE",
        "/api/monitoring/show/95396",
        Some(&token),
        None,
    )
    .await;
    let (_, second) = send(
        &t.app,
        "DELETE",
        "/api/monitoring/show/95396",
        Some(&token),
        None,
    )
    .await;
    let (_, list) = get(&t.app, "/api/monitoring", Some(&token)).await;

    assert_eq!(first["ok"], json!(true));
    assert_eq!(second["ok"], json!(false));
    assert_eq!(list, json!([]));
}

#[tokio::test]
async fn a_movie_has_no_episodes_to_switch() {
    let t = test_app();
    let token = admin(&t);

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/monitoring/movie/603/episodes",
        Some(&token),
        Some(json!({ "episodes": [] })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn switching_episodes_of_an_unmonitored_show_is_refused() {
    let t = test_app();
    let token = admin(&t);

    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/monitoring/show/1/episodes",
        Some(&token),
        Some(json!({ "seasons": [{ "season": 1, "monitored": true }] })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body.to_string().contains("not monitored"), "{body}");
}

#[tokio::test]
async fn a_bulk_change_is_bounded() {
    let t = test_app();
    let token = admin(&t);
    let titles: Vec<serde_json::Value> = (0..501)
        .map(|n| json!({ "kind": "movie", "tmdbId": n }))
        .collect();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/monitoring/bulk",
        Some(&token),
        Some(json!({ "titles": titles })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_bulk_change_reports_each_title_it_could_not_set() {
    let t = test_app();
    let token = admin(&t);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/monitoring/bulk",
        Some(&token),
        Some(json!({ "titles": [{ "kind": "movie", "tmdbId": 1 }], "preset": "all" })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["monitored"], json!(0));
    assert_eq!(body["failed"][0]["tmdbId"], json!(1));
}
