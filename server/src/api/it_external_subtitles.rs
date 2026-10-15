use axum::http::StatusCode;

use crate::api::test_support::{
    get, media_ticket_for, seed_playable_item, test_app, text, TestApp, FILM,
};

// A French subtitle saved by a Windows editor: `\xE9` is é in Windows-1252 and
// not valid UTF-8, so a reader that assumes UTF-8 loses the accent.
const CP1252_SRT: &[u8] = b"1\n00:00:01,000 --> 00:00:04,000\nIl \xE9tait d\xE9j\xE0 l\xE0\n\n2\n00:00:05,000 --> 00:00:08,000\nNa\xEFvement\n";

fn beside(t: &TestApp, name: &str, body: &[u8]) {
    let path = t.state.config.data_dir.join(name);
    std::fs::write(path, body).expect("write a subtitle file beside the film");
}

fn language_at(subtitles: &serde_json::Value, language: &str) -> usize {
    subtitles
        .as_array()
        .expect("a subtitle list")
        .iter()
        .position(|track| track["language"] == language)
        .expect("a track in that language")
}

#[tokio::test]
async fn a_subtitle_file_beside_a_film_is_offered_after_the_tracks_inside_it() {
    let t = test_app();
    let item = seed_playable_item(&t.state, "Sidecar", FILM);
    beside(&t, "Sidecar.fr.forced.srt", CP1252_SRT);

    let (status, body) = get(&t.app, &format!("/api/items/{item}"), Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let external = language_at(&body["subtitles"], "fr");
    assert!(external > 0, "the file's own tracks come first");
    assert_eq!(body["subtitles"][external]["codec"], "subrip");
    assert_eq!(body["subtitles"][external]["title"], "Forced");
    assert_eq!(body["subtitles"][external]["forced"], true);
}

#[tokio::test]
async fn a_picture_subtitle_beside_a_film_is_never_offered() {
    let t = test_app();
    let item = seed_playable_item(&t.state, "Bitmap", FILM);
    beside(&t, "Bitmap.fr.sub", CP1252_SRT);
    beside(&t, "Bitmap.fr.idx", CP1252_SRT);

    let (_, body) = get(&t.app, &format!("/api/items/{item}"), Some(&t.token)).await;

    let offered = body["subtitles"].as_array().expect("a subtitle list");
    assert!(offered.iter().all(|track| track["language"] != "fr"));
}

#[tokio::test]
async fn the_index_past_a_files_own_tracks_answers_the_file_beside_it_as_webvtt() {
    let t = test_app();
    let item = seed_playable_item(&t.state, "Accents", FILM);
    beside(&t, "Accents.fr.srt", CP1252_SRT);
    let ticket = media_ticket_for(&t.state, &t.token);
    let (_, body) = get(&t.app, &format!("/api/items/{item}"), Some(&t.token)).await;
    let external = language_at(&body["subtitles"], "fr");

    let (status, cues) = text(
        &t.app,
        "GET",
        &format!("/api/items/{item}/subtitles/{external}.vtt?t={ticket}"),
        None,
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(cues.starts_with("WEBVTT"), "{cues}");
    assert!(cues.contains("Il était déjà là"), "{cues}");
    assert!(cues.contains("Naïvement"), "{cues}");
}

#[tokio::test]
async fn an_index_naming_neither_a_track_nor_a_file_beside_one_is_not_found() {
    let t = test_app();
    let item = seed_playable_item(&t.state, "Nothing", FILM);
    let ticket = media_ticket_for(&t.state, &t.token);

    let (status, _) = get(
        &t.app,
        &format!("/api/items/{item}/subtitles/9.vtt?t={ticket}"),
        Some(&t.token),
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
