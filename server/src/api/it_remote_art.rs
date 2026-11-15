//! Integration tests for provider artwork served by this server
//! (`remote_art.rs`): the rewrite of an API answer and the signed image route.
//! No network is reached: the one image asked for is already on disk.

use axum::http::{header, StatusCode};

use crate::api::test_support::{get, raw, test_app, TestApp};
use crate::model::{Audience, NotificationEvent, NotificationSpec};
use crate::services::remote_art;

const POSTER: &str = "https://image.tmdb.org/t/p/w342/aBc123.jpg";

fn kept(t: &TestApp, name: &str, bytes: &[u8]) {
    let dir = crate::infra::image::images_dir(&t.state.config.data_dir).join("tmdb");
    std::fs::create_dir_all(&dir).expect("art folder");
    std::fs::write(dir.join(name), bytes).expect("kept image");
}

#[tokio::test]
async fn an_answer_names_a_provider_poster_by_this_servers_path_for_it() {
    let t = test_app();
    let spec = NotificationSpec::new(
        NotificationEvent::RequestAvailable,
        "notifications.request.available.title",
        "notifications.request.available.body",
    )
    .param("title", "Dune")
    .image(Some(POSTER.to_string()));
    crate::services::notify::emit(&t.state, &Audience::user(&t.user_id), &spec);

    let (status, inbox) = get(&t.app, "/api/notifications", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        inbox["notifications"][0]["imageUrl"].as_str(),
        remote_art::served(&t.state.media_ticket_key, POSTER).as_deref()
    );
    assert!(!inbox.to_string().contains("image.tmdb.org"));
}

#[tokio::test]
async fn a_signed_path_answers_with_the_image_under_a_policy_that_runs_nothing() {
    let t = test_app();
    kept(&t, "w342-aBc123.jpg", b"the poster");
    let path = remote_art::served(&t.state.media_ticket_key, POSTER).unwrap();

    let (status, headers, _) = raw(&t.app, "GET", &format!("{path}?w=320"), None, None, &[]).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[header::CONTENT_TYPE], "image/jpeg");
    assert_eq!(
        headers[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(
        headers[header::CONTENT_SECURITY_POLICY],
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
}

#[tokio::test]
async fn a_path_this_server_did_not_sign_is_refused_before_anything_is_fetched() {
    let t = test_app();
    kept(&t, "w342-aBc123.jpg", b"the poster");

    let (forged, _) = get(
        &t.app,
        "/api/images/tmdb/0000000000000000/w342/aBc123.jpg",
        None,
    )
    .await;
    let (misnamed, _) = get(
        &t.app,
        "/api/images/tmdb/0000000000000000/w342/aBc123.exe",
        None,
    )
    .await;

    assert_eq!(forged, StatusCode::FORBIDDEN);
    assert_eq!(misnamed, StatusCode::BAD_REQUEST);
}
