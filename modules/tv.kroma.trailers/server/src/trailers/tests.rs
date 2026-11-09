use super::*;

use kroma_module_sdk::testing::temp_dir;
use serde_json::json;

use crate::mp4::fixture::{audio_fragments, video_fragments};
use crate::test_support::{player_answer, Recorded};

fn video() -> VideoId {
    VideoId::parse("qu5n7RALVpE").unwrap()
}

fn served(answers: Vec<serde_json::Value>) -> Arc<Recorded> {
    Arc::new(Recorded::serving(
        answers,
        vec![
            (137, video_fragments().bytes),
            (140, audio_fragments().bytes),
        ],
    ))
}

fn ok_player() -> serde_json::Value {
    player_answer(
        video_fragments().bytes.len(),
        audio_fragments().bytes.len(),
        "189",
    )
}

#[test]
fn a_fetch_downloads_both_streams_in_ranges_and_remuxes_them() {
    let dir = temp_dir("trailers-fetch");
    let web = served(vec![
        json!({ "responseContext": { "visitorData": "v1" } }),
        ok_player(),
    ]);
    let trailers = Trailers::with(web.clone(), dir.path().to_path_buf(), 64);

    let fetched = trailers.fetch(&video(), 1080).unwrap();

    assert_eq!(
        (fetched.width, fetched.height, fetched.client.as_str()),
        (1920, 1080, "visionos")
    );
    assert!(web.downloads() > 2);
    assert!(dir.path().join("qu5n7RALVpE").join(TRAILER_FILE).exists());
    assert!(!dir.path().join("qu5n7RALVpE").join("video.mp4").exists());
}

#[test]
fn a_sign_in_wall_is_retried_once_with_a_fresh_visitor() {
    let dir = temp_dir("trailers-visitor");
    let web = served(vec![
        json!({ "responseContext": { "visitorData": "v1" } }),
        json!({ "playabilityStatus": { "status": "LOGIN_REQUIRED" } }),
        json!({ "responseContext": { "visitorData": "v2" } }),
        ok_player(),
    ]);
    let trailers = Trailers::with(web.clone(), dir.path().to_path_buf(), 1 << 20);

    let fetched = trailers.fetch(&video(), 1080);

    assert!(fetched.is_ok());
    assert_eq!(
        web.sent(3)
            .1
            .iter()
            .find(|(k, _)| k == "X-Goog-Visitor-Id")
            .map(|(_, v)| v.as_str()),
        Some("v2")
    );
}

#[test]
fn a_video_longer_than_a_trailer_is_refused_before_any_download() {
    let dir = temp_dir("trailers-long");
    let long = player_answer(10, 10, "7200");
    let web = served(vec![
        json!({ "responseContext": { "visitorData": "v1" } }),
        long,
    ]);
    let trailers = Trailers::with(web.clone(), dir.path().to_path_buf(), 1 << 20);

    let refused = trailers.fetch(&video(), 1080);

    assert!(refused.is_err());
    assert_eq!(web.downloads(), 0);
}

#[test]
fn a_read_hands_back_the_asked_slice_of_the_finished_file() {
    let dir = temp_dir("trailers-read");
    let web = served(vec![
        json!({ "responseContext": { "visitorData": "v1" } }),
        ok_player(),
    ]);
    let trailers = Trailers::with(web, dir.path().to_path_buf(), 1 << 20);
    trailers.fetch(&video(), 1080).unwrap();
    let whole = std::fs::read(dir.path().join("qu5n7RALVpE").join(TRAILER_FILE)).unwrap();

    let slice = trailers.read(&video(), 8, 16).unwrap();

    assert_eq!(slice, whole[8..24]);
}

#[test]
fn a_video_id_that_could_name_another_folder_is_refused() {
    let ids = ["../../etc/pa", "short", "qu5n7RALVpE/", "qu5n7RALVp."];

    let refused = ids.iter().all(|raw| VideoId::parse(raw).is_err());

    assert!(refused);
}
