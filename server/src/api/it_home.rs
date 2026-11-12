use axum::http::{header, StatusCode};
use serde_json::{json, Value};

use crate::api::test_support::{
    demo_library_ids, get, grant_libraries, raw, seed_session, send, test_app,
};
use crate::model::Permission;

fn entries(home: &Value) -> Vec<&Value> {
    home.as_array()
        .expect("sections")
        .iter()
        .flat_map(|s| s["items"].as_array().expect("items"))
        .collect()
}

fn entry_ids(home: &Value) -> Vec<String> {
    entries(home)
        .into_iter()
        .map(|e| {
            e["item"]["id"]
                .as_str()
                .or_else(|| e["show"]["id"].as_str())
                .expect("entry id")
                .to_string()
        })
        .collect()
}

fn first_movie(home: &Value) -> String {
    entries(home)
        .into_iter()
        .find_map(|e| e["item"]["id"].as_str())
        .expect("a movie on the home")
        .to_string()
}

#[tokio::test]
async fn the_card_home_lists_the_same_titles_without_files_or_credits() {
    let t = test_app();
    let (_, full) = get(&t.app, "/api/home", Some(&t.token)).await;

    let (status, cards) = get(&t.app, "/api/home?view=card", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert!(!entry_ids(&cards).is_empty());
    assert_eq!(entry_ids(&cards), entry_ids(&full));
    for entry in entries(&cards) {
        let title = entry.get("item").unwrap_or(&entry["show"]);
        for gone in ["files", "subtitles", "audioTracks", "relPath"] {
            assert!(title.get(gone).is_none(), "{gone} in {entry}");
        }
        assert!(title["metadata"].get("cast").is_none(), "{entry}");
    }
}

#[tokio::test]
async fn an_unknown_home_view_is_refused() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/home?view=poster", Some(&t.token)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_revisit_holding_the_tag_is_answered_without_a_body() {
    let t = test_app();
    let (_, first, _) = raw(&t.app, "GET", "/api/shows", Some(&t.token), None, &[]).await;
    let tag = first[header::ETAG].to_str().unwrap().to_string();

    let (status, headers, body) = raw(
        &t.app,
        "GET",
        "/api/shows",
        Some(&t.token),
        None,
        &[("if-none-match", &tag), ("accept-encoding", "br")],
    )
    .await;

    assert_eq!(status, StatusCode::NOT_MODIFIED);
    assert_eq!(body, Value::Null);
    assert_eq!(headers[header::ETAG], tag.as_str());
    assert!(headers.get(header::CONTENT_ENCODING).is_none());
    assert_eq!(first[header::CACHE_CONTROL], "private, no-cache");
}

#[tokio::test]
async fn a_film_started_since_the_tag_was_taken_gets_the_new_home() {
    let t = test_app();
    let (_, headers, home) = raw(&t.app, "GET", "/api/home", Some(&t.token), None, &[]).await;
    let tag = headers[header::ETAG].to_str().unwrap().to_string();
    let film = first_movie(&home);
    let progress = json!({ "positionMs": 60_000, "durationMs": 600_000 });
    send(
        &t.app,
        "PUT",
        &format!("/api/progress/{film}"),
        Some(&t.token),
        Some(progress),
    )
    .await;

    let (status, _, again) = raw(
        &t.app,
        "GET",
        "/api/home",
        Some(&t.token),
        None,
        &[("if-none-match", &tag)],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(!entry_ids(&again).contains(&film));
}

#[tokio::test]
async fn a_grant_narrowed_since_the_last_visit_hides_the_rows_at_once() {
    let t = test_app();
    let (viewer_id, viewer) = seed_session(&t.state, "v@test.dev", "v", &[Permission::Playback]);
    let (movies_lib, shows_lib) = demo_library_ids();
    let (_, before) = get(&t.app, "/api/home", Some(&viewer)).await;
    grant_libraries(&t.state, &viewer_id, &[shows_lib]);

    let (_, after) = get(&t.app, "/api/home", Some(&viewer)).await;

    assert!(entries(&before)
        .iter()
        .any(|e| e["item"]["library"] == json!(movies_lib)));
    assert!(entries(&after)
        .iter()
        .all(|e| e["item"]["library"] != json!(movies_lib)));
}

#[tokio::test]
async fn another_accounts_tag_is_not_honoured_for_rows_it_may_not_see() {
    let t = test_app();
    let (viewer_id, viewer) = seed_session(&t.state, "v@test.dev", "v", &[Permission::Playback]);
    let (_movies_lib, shows_lib) = demo_library_ids();
    grant_libraries(&t.state, &viewer_id, &[shows_lib]);
    let (_, owners, _) = raw(&t.app, "GET", "/api/home", Some(&t.token), None, &[]).await;
    let tag = owners[header::ETAG].to_str().unwrap().to_string();

    let (status, headers, _) = raw(
        &t.app,
        "GET",
        "/api/home",
        Some(&viewer),
        None,
        &[("if-none-match", &tag)],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_ne!(headers[header::ETAG], tag.as_str());
}
