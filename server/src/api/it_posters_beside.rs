use std::path::{Path, PathBuf};

use axum::http::StatusCode;

use crate::api::test_support::{get, raw, seed_playable_item, test_app, TestApp};
use crate::db;
use crate::db::art_beside::{Picture, POSTER};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::infra::image::{beside_name, PUBLIC_PREFIX};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x02\x00\x00\x00\x03\x08\x02\x00\x00\x00\x36\x88\x49\xd6\x00\x00\x00\x10IDAT\x78\x9c\x63\xf8\xcf\xc0\x00\x44\x0c\x28\x14\x00\x44\xd0\x05\xfb\xa4\xcf\xde\x80\x00\x00\x00\x00IEND\xae\x42\x60\x82";

fn put(t: &TestApp, rel: &str, bytes: &[u8]) -> PathBuf {
    let path = t.state.config.data_dir.join(rel);
    std::fs::create_dir_all(path.parent().expect("a folder")).expect("create the folder");
    std::fs::write(&path, bytes).expect("write the file");
    path
}

fn keep_poster(t: &TestApp, subject: (&'static str, &str), picture: &Path) -> String {
    let url = format!(
        "{PUBLIC_PREFIX}{}",
        beside_name(picture).expect("a picture")
    );
    let row = Picture {
        subject_kind: subject.0,
        subject_id: subject.1.to_string(),
        library: "lib".into(),
        role: POSTER,
        path: picture.to_string_lossy().into_owned(),
        url: url.clone(),
    };
    db::art_beside::replace(&t.state.db, &[row], &Default::default()).expect("index the picture");
    url
}

async fn fetched(t: &TestApp, uri: &str) -> (StatusCode, String) {
    let (status, headers, _) = raw(&t.app, "GET", uri, Some(&t.token), None, &[]).await;
    let header = |name: &str| headers.get(name).map(|v| v.to_str().unwrap().to_string());
    let shown = header("location").or_else(|| header("content-type"));
    (status, shown.unwrap_or_default())
}

#[tokio::test]
async fn a_film_never_matched_shows_the_picture_beside_its_file() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let url = keep_poster(&t, (ITEM, &film), &put(&t, "Heat-poster.png", PNG));

    let poster = fetched(&t, &format!("/api/items/{film}/poster")).await;
    let picture = fetched(&t, &url).await;

    assert_eq!(poster, (StatusCode::FOUND, url));
    assert_eq!(picture, (StatusCode::OK, "image/webp".to_string()));
}

#[tokio::test]
async fn a_picture_that_cannot_be_read_is_passed_over_for_the_placeholder() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    let url = keep_poster(
        &t,
        (ITEM, &film),
        &put(&t, "Heat-poster.png", b"not a picture"),
    );

    let picture = fetched(&t, &url).await;
    let (status, kind) = fetched(&t, &format!("/api/items/{film}/poster")).await;

    assert_eq!(picture.0, StatusCode::NOT_FOUND);
    assert_eq!(status, StatusCode::OK);
    assert!(kind.starts_with("image/svg+xml"));
}

#[tokio::test]
async fn a_show_and_its_episodes_show_the_poster_in_the_show_s_folder() {
    let t = test_app();
    let episode = crate::services::demo::demo_data()
        .items
        .into_iter()
        .find(|i| i.episode_title.as_deref() == Some("Islands"))
        .expect("a demo episode");
    let show = episode.show_id.clone().expect("the episode's show");
    let show_uri = format!("/api/shows/{show}/poster");

    let before = fetched(&t, &show_uri).await;
    let url = keep_poster(&t, (SHOW, &show), &put(&t, "Shows/Planet/folder.png", PNG));
    let after = fetched(&t, &show_uri).await;
    let for_episode = fetched(&t, &format!("/api/items/{}/poster", episode.id)).await;

    assert!(before.1.starts_with("image/svg+xml"));
    assert_eq!(after, (StatusCode::FOUND, url.clone()));
    assert_eq!(for_episode, (StatusCode::FOUND, url));
}

#[tokio::test]
async fn a_picture_beside_a_matched_film_replaces_its_fetched_poster() {
    let t = test_app();
    let film = crate::api::test_support::demo_item_id("Blade Runner 2049");
    let fetched_art = serde_json::json!({
        "tmdbId": 1, "genres": [], "tmdbUrl": "",
        "posterUrl": "/api/images/feedfeedfeedfeed.webp",
    });
    let meta = serde_json::from_value(fetched_art).expect("metadata literal");
    db::set_item_metadata(&t.state.db, &film, &meta).expect("set item metadata");
    let url = keep_poster(&t, (ITEM, &film), &put(&t, "Blade Runner 2049.png", PNG));

    let (status, item) = get(&t.app, &format!("/api/items/{film}"), Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(item["metadata"]["posterUrl"], serde_json::json!(url));
}
