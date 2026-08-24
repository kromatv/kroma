//! Integration tests for the admin notification image listing
//! (`GET /api/admin/notifications/images`): only notification uploads come
//! back, newest first, and only to an admin. Files are seeded on disk directly
//! so no ffmpeg/cwebp is needed.

use std::fs;
use std::time::{Duration, SystemTime};

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, test_app};
use crate::model::Permission;

fn seed_image(dir: &std::path::Path, name: &str, age: Duration) {
    fs::create_dir_all(dir).expect("images dir");
    let path = dir.join(name);
    fs::write(&path, b"not-really-webp").expect("write image");
    let file = fs::File::options()
        .write(true)
        .open(&path)
        .expect("open image");
    file.set_modified(SystemTime::now() - age)
        .expect("set mtime");
}

#[tokio::test]
async fn only_notification_uploads_are_listed_newest_first() {
    let t = test_app();
    let dir = crate::infra::image::images_dir(&t.state.config.data_dir);
    seed_image(
        &dir,
        "notif-aaaaaaaaaaaaaaaa-w1280.webp",
        Duration::from_secs(60),
    );
    seed_image(
        &dir,
        "notif-bbbbbbbbbbbbbbbb-w1280.webp",
        Duration::from_secs(0),
    );
    // An upload stored before the `notif-` prefix existed stays listed.
    seed_image(
        &dir,
        "cccccccccccccccc-w1280.webp",
        Duration::from_secs(120),
    );
    // A cached poster, an avatar and a sized rendition never appear.
    seed_image(&dir, "dddddddddddddddd.webp", Duration::from_secs(10));
    seed_image(&dir, "eeeeeeeeeeeeeeee-w512.webp", Duration::from_secs(10));
    seed_image(
        &dir,
        "notif-aaaaaaaaaaaaaaaa-w1280.webp.w320.webp",
        Duration::from_secs(5),
    );
    // Nothing that is not a .webp at all: the store holds the odd original
    // beside its rendition, and a name that merely STARTS like an upload is
    // still not one.
    seed_image(
        &dir,
        "notif-ffffffffffffffff-w1280.jpg",
        Duration::from_secs(5),
    );
    seed_image(&dir, "notif-ffffffffffffffff-w1280", Duration::from_secs(5));

    let (status, body) = get(&t.app, "/api/admin/notifications/images", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let images = body["images"].as_array().unwrap();
    let names: Vec<&str> = images.iter().map(|i| i["name"].as_str().unwrap()).collect();
    assert_eq!(
        names,
        [
            "notif-bbbbbbbbbbbbbbbb-w1280.webp",
            "notif-aaaaaaaaaaaaaaaa-w1280.webp",
            "cccccccccccccccc-w1280.webp",
        ]
    );
    assert_eq!(
        images[0]["url"],
        json!("/api/images/notif-bbbbbbbbbbbbbbbb-w1280.webp")
    );
    assert!(images[0]["uploadedAt"].as_i64().unwrap() > 0);
    assert!(images[0]["bytes"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn an_upload_the_encoder_cannot_read_is_refused_as_unsupported_media() {
    // The only path into the content-addressed store. The bytes are not an
    // image, so the answer holds whether or not this machine has cwebp.
    let t = test_app();
    let (status, _h, _b) = raw_bytes(
        &t.app,
        "/api/admin/notifications/image",
        &t.token,
        b"not-an-image".to_vec(),
    )
    .await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);

    let dir = crate::infra::image::images_dir(&t.state.config.data_dir);
    let stored = std::fs::read_dir(&dir).map(Iterator::count).unwrap_or(0);
    assert_eq!(stored, 0, "a rejected upload must leave nothing behind");
}

#[tokio::test]
async fn an_empty_upload_is_refused_before_any_decoding() {
    let t = test_app();
    let (status, _h, _b) = raw_bytes(
        &t.app,
        "/api/admin/notifications/image",
        &t.token,
        Vec::new(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

async fn raw_bytes(
    app: &axum::Router,
    uri: &str,
    token: &str,
    bytes: Vec<u8>,
) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt as _;

    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "image/png")
        .body(Body::from(bytes))
        .expect("build request");
    let resp = app.clone().oneshot(req).await.expect("response");
    let status = resp.status();
    let headers = resp.headers().clone();
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap_or_default();
    (status, headers, body.to_vec())
}

#[tokio::test]
async fn an_empty_store_lists_nothing() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/admin/notifications/images", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["images"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn the_listing_is_closed_without_settings_manage() {
    let t = test_app();
    let (_id, plain) = seed_session(
        &t.state,
        "plain-img@test.dev",
        "plain-img",
        &[Permission::Playback],
    );

    let (status, _) = get(&t.app, "/api/admin/notifications/images", Some(&plain)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = get(&t.app, "/api/admin/notifications/images", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_upload_the_store_already_holds_is_adopted_without_an_encoder() {
    let t = test_app();
    let bytes = "a poster this store has seen before";
    let name = format!(
        "notif-{}-w1280.webp",
        crate::services::scan::short_hash(bytes)
    );
    let dir = crate::infra::image::images_dir(&t.state.config.data_dir);
    seed_image(&dir, &name, Duration::from_secs(0));

    let (status, _h, body) = raw_bytes(
        &t.app,
        "/api/admin/notifications/image",
        &t.token,
        bytes.as_bytes().to_vec(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let body: serde_json::Value = serde_json::from_slice(&body).expect("json body");
    assert_eq!(body["imageUrl"], json!(format!("/api/images/{name}")));

    let (_, listed) = get(&t.app, "/api/admin/notifications/images", Some(&t.token)).await;
    assert_eq!(listed["images"][0]["name"], json!(name));
}
