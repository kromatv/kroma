//! Integration tests for the artwork endpoints (`images.rs`): the poster
//! redirect and the composited preview card's art selection. No network,
//! ffmpeg, or disk assets are reached — the card 404s before compositing.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, test_app};
use crate::model::{MediaItem, Metadata};

fn demo_episode() -> MediaItem {
    crate::services::demo::demo_data()
        .items
        .into_iter()
        .find(|i| i.episode_title.as_deref() == Some("Islands"))
        .expect("demo episode")
}

fn art_metadata() -> Metadata {
    serde_json::from_value(json!({
        "tmdbId": 1,
        "genres": [],
        "tmdbUrl": "",
        "backdropUrl": "/api/images/feedfeedfeedfeed.webp",
        "logoUrl": "/api/images/feedfeedfeedfeed.png",
    }))
    .expect("metadata literal")
}

#[tokio::test]
async fn an_episode_card_falls_back_to_the_show_art() {
    let t = test_app();
    let ep = demo_episode();
    let show_id = ep.show_id.clone().expect("episode show id");

    // The demo episode has no metadata at all: nothing to select from.
    let (status, body) = get(&t.app, &format!("/api/items/{}/card", ep.id), Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], json!("no artwork for card"));

    // With art on the SHOW only, selection succeeds and the request proceeds
    // to compositing, which 404s differently on the missing cache file.
    crate::db::set_show_metadata(&t.state.db, &show_id, &art_metadata()).expect("set show metadata");
    let (status, body) = get(&t.app, &format!("/api/items/{}/card", ep.id), Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], json!("artwork unavailable"));
}

#[tokio::test]
async fn a_movie_card_ignores_show_art_and_needs_its_own() {
    let t = test_app();
    let movie = crate::api::test_support::demo_item_id("Blade Runner 2049");

    let (status, body) = get(&t.app, &format!("/api/items/{movie}/card"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], json!("no artwork for card"));

    crate::db::set_item_metadata(&t.state.db, &movie, &art_metadata()).expect("set item metadata");
    let (status, body) = get(&t.app, &format!("/api/items/{movie}/card"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], json!("artwork unavailable"));
}
