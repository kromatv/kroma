use axum::http::StatusCode;

use crate::api::test_support::{
    demo_item_id, get, household_where_the_viewer_only_sees_films, send, text, ticketed, TestApp,
};
use crate::db;

fn track_on(app: &TestApp, item_id: &str, id: &str) -> String {
    let path = app.state.config.data_dir.join(format!("{id}.vtt"));
    std::fs::write(&path, "WEBVTT\n\n00:00.000 --> 00:01.000\nhidden line\n").unwrap();
    db::insert_downloaded_sub(
        &app.state.db,
        &db::DownloadedSub {
            id: id.into(),
            item_id: item_id.into(),
            language: Some("fr".into()),
            label: "Francais".into(),
            provider: "whisper".into(),
            path: path.to_string_lossy().into_owned(),
        },
    )
    .unwrap();
    path.to_string_lossy().into_owned()
}

#[tokio::test]
async fn a_hidden_items_track_is_not_served_under_a_visible_item() {
    let h = household_where_the_viewer_only_sees_films();
    track_on(&h.app, &h.episode, "hidden-track");
    let film = demo_item_id("The Matrix");

    let uri = ticketed(
        &format!("/api/items/{film}/subtitles/dl/hidden-track.vtt"),
        &h.ticket,
    );
    let (status, _) = text(&h.app.app, "GET", &uri, None, None).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_hidden_items_tracks_are_not_listed() {
    let h = household_where_the_viewer_only_sees_films();
    track_on(&h.app, &h.episode, "hidden-track");

    let (status, _) = get(
        &h.app.app,
        &format!("/api/items/{}/subtitles/downloaded", h.episode),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_hidden_items_track_cannot_be_deleted_through_a_visible_item() {
    let h = household_where_the_viewer_only_sees_films();
    let path = track_on(&h.app, &h.episode, "hidden-track");
    let film = demo_item_id("The Matrix");

    let (status, _) = send(
        &h.app.app,
        "DELETE",
        &format!("/api/items/{film}/subtitles/downloaded/hidden-track"),
        Some(&h.viewer),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(std::path::Path::new(&path).exists());
}

#[tokio::test]
async fn a_visible_items_track_is_still_served() {
    let h = household_where_the_viewer_only_sees_films();
    let film = demo_item_id("The Matrix");
    track_on(&h.app, &film, "film-track");

    let uri = ticketed(
        &format!("/api/items/{film}/subtitles/dl/film-track.vtt"),
        &h.ticket,
    );
    let (status, _) = text(&h.app.app, "GET", &uri, None, None).await;

    assert_eq!(status, StatusCode::OK);
}
