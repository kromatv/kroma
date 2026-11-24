use std::path::{Path, PathBuf};

use axum::http::StatusCode;

use crate::api::test_support::{raw, seed_playable_item, test_app, TestApp};
use crate::db;
use crate::model::MediaItem;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x02\x00\x00\x00\x03\x08\x02\x00\x00\x00\x36\x88\x49\xd6\x00\x00\x00\x10IDAT\x78\x9c\x63\xf8\xcf\xc0\x00\x44\x0c\x28\x14\x00\x44\xd0\x05\xfb\xa4\xcf\xde\x80\x00\x00\x00\x00IEND\xae\x42\x60\x82";

fn put(t: &TestApp, rel: &str, bytes: &[u8]) -> PathBuf {
    let path = t.state.config.data_dir.join(rel);
    std::fs::create_dir_all(path.parent().expect("a folder")).expect("create the folder");
    std::fs::write(&path, bytes).expect("write the file");
    path
}

fn move_episode_to(t: &TestApp, title: &str, path: &Path) -> MediaItem {
    let data = crate::services::demo::demo_data();
    let mut items = data.items.clone();
    let episode = items
        .iter_mut()
        .find(|i| i.episode_title.as_deref() == Some(title))
        .expect("a demo episode");
    let abs = path.to_string_lossy().into_owned();
    episode.abs_path = Some(abs.clone());
    episode.files[0].abs_path = Some(abs);
    let moved = episode.clone();
    db::sync_all(
        &t.state.db,
        &data.libraries,
        &data.shows,
        &items,
        &data.mtimes,
    )
    .expect("move the episode on disk");
    moved
}

async fn poster_type(t: &TestApp, uri: &str) -> String {
    let (status, headers, _) = raw(&t.app, "GET", uri, Some(&t.token), None, &[]).await;
    assert_eq!(status, StatusCode::OK);
    let kind = headers.get("content-type").expect("a content type");
    kind.to_str().expect("an ascii type").to_string()
}

#[tokio::test]
async fn a_film_with_no_fetched_poster_shows_the_picture_beside_its_file() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    put(&t, "Heat-poster.png", PNG);

    let kind = poster_type(&t, &format!("/api/items/{film}/poster")).await;

    assert_eq!(kind, "image/webp");
}

#[tokio::test]
async fn a_picture_that_cannot_be_read_leaves_the_placeholder() {
    let t = test_app();
    let film = seed_playable_item(&t.state, "Heat", b"film");
    put(&t, "Heat-poster.png", b"not a picture");

    let kind = poster_type(&t, &format!("/api/items/{film}/poster")).await;

    assert!(kind.starts_with("image/svg+xml"));
}

#[tokio::test]
async fn a_show_and_its_episodes_show_the_poster_in_the_show_s_folder() {
    let t = test_app();
    let file = put(&t, "Shows/Planet/Season 01/Planet S01E01.mp4", b"episode");
    let episode = move_episode_to(&t, "Islands", &file);
    let show = episode.show_id.clone().expect("the episode's show");
    let show_uri = format!("/api/shows/{show}/poster");
    let episode_uri = format!("/api/items/{}/poster", episode.id);

    let before = poster_type(&t, &show_uri).await;
    put(&t, "Shows/Planet/folder.png", PNG);
    let after = poster_type(&t, &show_uri).await;
    let for_episode = poster_type(&t, &episode_uri).await;

    assert!(before.starts_with("image/svg+xml"));
    assert_eq!(after, "image/webp");
    assert_eq!(for_episode, "image/webp");
}
