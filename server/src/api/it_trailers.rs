use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, media_ticket_for, raw, send, test_app, ticketed, TestApp};

const STREAM: &str = "/api/trailers/movie/1061474/qu5n7RALVpE/stream";

fn prepared(t: &TestApp) {
    let dir = t.state.config.data_dir.join("trailers");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("qu5n7RALVpE.mp4"), vec![7u8; 100]).unwrap();
}

#[tokio::test]
async fn without_a_tmdb_key_the_list_is_empty_and_nothing_plays() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/trailers/movie/1061474", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "playable": false, "trailers": [] }));
}

#[tokio::test]
async fn the_list_needs_a_session() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/trailers/movie/1061474", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_kind_that_is_neither_a_film_nor_a_show_is_a_404() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/trailers/album/1", Some(&t.token)).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn preparing_with_no_module_answering_is_a_404() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/trailers/movie/1061474/qu5n7RALVpE/prepare",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_prepared_trailer_streams_in_ranges_to_a_media_ticket() {
    let t = test_app();
    prepared(&t);
    let ticket = media_ticket_for(&t.state, &t.token);

    let (status, headers, _) = raw(
        &t.app,
        "GET",
        &ticketed(STREAM, &ticket),
        None,
        None,
        &[("range", "bytes=0-9")],
    )
    .await;

    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(headers["content-range"], "bytes 0-9/100");
    assert_eq!(headers["content-type"], "video/mp4");
}

#[tokio::test]
async fn a_stream_with_no_credential_is_refused() {
    let t = test_app();
    prepared(&t);

    let (status, _, _) = raw(&t.app, "GET", STREAM, None, None, &[]).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_trailer_never_prepared_is_a_404_even_with_a_ticket() {
    let t = test_app();
    let ticket = media_ticket_for(&t.state, &t.token);

    let (status, _, _) = raw(&t.app, "GET", &ticketed(STREAM, &ticket), None, None, &[]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
