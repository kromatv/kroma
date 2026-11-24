use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    demo_item_id, get, raw, seed_playable_item, seed_session, test_app, upload, TestApp,
};
use crate::db;
use crate::db::metadata_core::ITEM;
use crate::model::Permission;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x02\x00\x00\x00\x03\x08\x02\x00\x00\x00\x36\x88\x49\xd6\x00\x00\x00\x10IDAT\x78\x9c\x63\xf8\xcf\xc0\x00\x44\x0c\x28\x14\x00\x44\xd0\x05\xfb\xa4\xcf\xde\x80\x00\x00\x00\x00IEND\xae\x42\x60\x82";

async fn fetched(t: &TestApp, uri: &str) -> (StatusCode, String) {
    let (status, headers, _) = raw(&t.app, "GET", uri, Some(&t.token), None, &[]).await;
    let header = |name: &str| headers.get(name).map(|v| v.to_str().unwrap().to_string());
    let shown = header("location").or_else(|| header("content-type"));
    (status, shown.unwrap_or_default())
}

fn chosen_poster(t: &TestApp, film: &str) -> String {
    let urls = db::art_chosen::chosen(&t.state.db, ITEM, film).expect("read the chosen art");
    urls.poster.expect("a chosen poster")
}

#[tokio::test]
async fn a_poster_an_admin_uploads_is_the_one_a_film_never_matched_shows() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");

    let status = upload(
        &t.app,
        &format!("/api/art/item/{film}/poster"),
        &t.token,
        PNG.to_vec(),
    )
    .await;
    let url = chosen_poster(&t, &film);
    let poster = fetched(&t, &format!("/api/items/{film}/poster")).await;
    let picture = fetched(&t, &url).await;

    assert_eq!(status, StatusCode::OK);
    assert!(url.starts_with("/api/images/chosen-"));
    assert_eq!(poster, (StatusCode::FOUND, url));
    assert_eq!(picture, (StatusCode::OK, "image/webp".to_string()));
}

#[tokio::test]
async fn a_backdrop_an_admin_uploads_replaces_the_fetched_one_and_can_be_reset() {
    let t = test_app();
    let film = demo_item_id("Blade Runner 2049");
    let fetched_art = json!({
        "tmdbId": 1, "genres": [], "tmdbUrl": "",
        "backdropUrl": "/api/images/feedfeedfeedfeed.webp",
    });
    let meta = serde_json::from_value(fetched_art).expect("metadata literal");
    db::set_item_metadata(&t.state.db, &film, &meta).expect("set item metadata");
    let art = format!("/api/art/item/{film}/backdrop");

    upload(&t.app, &art, &t.token, PNG.to_vec()).await;
    let (_, chosen) = get(&t.app, &format!("/api/art/item/{film}"), Some(&t.token)).await;
    let (_, shown) = get(&t.app, &format!("/api/items/{film}"), Some(&t.token)).await;
    let (reset, _, _) = raw(&t.app, "DELETE", &art, Some(&t.token), None, &[]).await;
    let (_, after) = get(&t.app, &format!("/api/items/{film}"), Some(&t.token)).await;

    assert_eq!(chosen["poster"], json!(null));
    assert_eq!(shown["metadata"]["backdropUrl"], chosen["backdrop"]);
    assert_eq!(reset, StatusCode::NO_CONTENT);
    assert_eq!(
        after["metadata"]["backdropUrl"],
        json!("/api/images/feedfeedfeedfeed.webp")
    );
}

#[tokio::test]
async fn a_logo_an_admin_uploads_replaces_the_fetched_one() {
    let t = test_app();
    let film = demo_item_id("Blade Runner 2049");
    let fetched_art = json!({
        "tmdbId": 1, "genres": [], "tmdbUrl": "",
        "logoUrl": "/api/images/feedfeedfeedfeed.webp",
    });
    let meta = serde_json::from_value(fetched_art).expect("metadata literal");
    db::set_item_metadata(&t.state.db, &film, &meta).expect("set item metadata");

    let status = upload(
        &t.app,
        &format!("/api/art/item/{film}/logo"),
        &t.token,
        PNG.to_vec(),
    )
    .await;

    let (_, chosen) = get(&t.app, &format!("/api/art/item/{film}"), Some(&t.token)).await;
    let (_, shown) = get(&t.app, &format!("/api/items/{film}"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        chosen["logo"]
            .as_str()
            .is_some_and(|url| url.starts_with("/api/images/chosen-"))
    );
    assert_eq!(shown["metadata"]["logoUrl"], chosen["logo"]);
}

#[tokio::test]
async fn a_member_who_cannot_manage_the_library_cannot_choose_art() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let (_, member) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]);

    let status = upload(
        &t.app,
        &format!("/api/art/item/{film}/poster"),
        &member,
        PNG.to_vec(),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        db::art_chosen::chosen(&t.state.db, ITEM, &film).expect("read the chosen art"),
        Default::default()
    );
}

#[tokio::test]
async fn a_picture_for_no_known_title_or_role_is_not_found() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");

    let banner = upload(
        &t.app,
        &format!("/api/art/item/{film}/banner"),
        &t.token,
        PNG.to_vec(),
    )
    .await;
    let ghost = upload(&t.app, "/api/art/show/ghost/poster", &t.token, PNG.to_vec()).await;
    let person = upload(
        &t.app,
        &format!("/api/art/person/{film}/poster"),
        &t.token,
        PNG.to_vec(),
    )
    .await;

    assert_eq!(banner, StatusCode::NOT_FOUND);
    assert_eq!(ghost, StatusCode::NOT_FOUND);
    assert_eq!(person, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_file_that_is_not_a_picture_is_refused() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let uri = format!("/api/art/item/{film}/poster");

    let unreadable = upload(&t.app, &uri, &t.token, b"not a picture".to_vec()).await;
    let empty = upload(&t.app, &uri, &t.token, Vec::new()).await;

    assert_eq!(unreadable, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(empty, StatusCode::BAD_REQUEST);
}
