use axum::http::StatusCode;
use kroma_module_sdk::host::testing::StubHost;
use serde_json::{json, Value};

use super::routes;
use crate::http::test_support::{admin, call, host, seed_movie_file, LIBRARIAN};

async fn get(host: &StubHost, path: &str) -> (StatusCode, Value) {
    admin(routes::<StubHost>(), host, "GET", path, None).await
}

async fn put(host: &StubHost, path: &str, body: Value) -> (StatusCode, Value) {
    admin(routes::<StubHost>(), host, "PUT", path, Some(body)).await
}

async fn delete(host: &StubHost, path: &str) -> (StatusCode, Value) {
    admin(routes::<StubHost>(), host, "DELETE", path, None).await
}

async fn rules(host: &StubHost) -> Value {
    get(host, "/acquisition/rules").await.1
}

#[tokio::test]
async fn a_request_without_a_session_is_refused() {
    let host = host();

    let (status, _) = call(
        routes::<StubHost>(),
        &host,
        "GET",
        "/acquisition/rules",
        None,
        None,
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_rules_come_with_the_quality_vocabulary_and_a_default_profile() {
    let host = host();

    let (status, body) = get(&host, "/acquisition/rules").await;

    assert_eq!(status, StatusCode::OK);
    let default = body["defaultProfile"].as_str().unwrap();
    let ids: Vec<&str> = body["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_str().unwrap())
        .collect();
    assert!(ids.contains(&default));
    assert!(!body["formats"].as_array().unwrap().is_empty());
    assert!(!body["qualities"].as_array().unwrap().is_empty());
    assert!(body["sizes"]["movieRuntime"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn a_saved_profile_is_listed_with_its_new_name() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");
    profile["name"] = json!("Kids");

    let (status, body) = put(&host, "/acquisition/profiles/kids", profile).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": true }));
    let names: Vec<String> = rules(&host).await["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["name"].as_str().unwrap().to_string())
        .collect();
    assert!(names.contains(&"Kids".to_string()));
}

#[tokio::test]
async fn a_profile_whose_id_differs_from_the_address_is_refused() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");

    let (status, body) = put(&host, "/acquisition/profiles/other", profile).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("must match"));
}

#[tokio::test]
async fn a_profile_with_no_name_is_refused() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");
    profile["name"] = json!("  ");

    let (status, body) = put(&host, "/acquisition/profiles/kids", profile).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("no name"));
}

#[tokio::test]
async fn the_default_profile_cannot_be_deleted() {
    let host = host();
    let default = rules(&host).await["defaultProfile"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, body) = delete(&host, &format!("/acquisition/profiles/{default}")).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("default profile"));
}

#[tokio::test]
async fn another_profile_is_deleted_and_an_unknown_one_reports_nothing_removed() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");
    profile["name"] = json!("Kids");
    put(&host, "/acquisition/profiles/kids", profile).await;

    let (_, removed) = delete(&host, "/acquisition/profiles/kids").await;
    let (_, again) = delete(&host, "/acquisition/profiles/kids").await;

    assert_eq!(removed, json!({ "ok": true }));
    assert_eq!(again, json!({ "ok": false }));
}

#[tokio::test]
async fn the_default_profile_can_move_to_another_one() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");
    profile["name"] = json!("Kids");
    put(&host, "/acquisition/profiles/kids", profile).await;

    let (status, body) = put(
        &host,
        "/acquisition/default-profile",
        json!({ "id": "kids" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": true }));
    assert_eq!(rules(&host).await["defaultProfile"], "kids");
}

#[tokio::test]
async fn a_default_profile_nobody_defined_is_refused() {
    let host = host();

    let (status, body) = put(
        &host,
        "/acquisition/default-profile",
        json!({ "id": "ghost" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("ghost"));
}

#[tokio::test]
async fn a_saved_format_is_listed_and_can_be_deleted() {
    let host = host();
    let format = json!({
        "id": "x265",
        "name": "x265",
        "conditions": [{ "type": "releaseTitle", "pattern": "x265" }]
    });

    let (status, _) = put(&host, "/acquisition/formats/x265", format).await;
    let listed = rules(&host).await["formats"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["id"] == "x265");
    let (_, removed) = delete(&host, "/acquisition/formats/x265").await;
    let (_, again) = delete(&host, "/acquisition/formats/x265").await;

    assert_eq!(status, StatusCode::OK);
    assert!(listed);
    assert_eq!(removed, json!({ "ok": true }));
    assert_eq!(again, json!({ "ok": false }));
}

#[tokio::test]
async fn a_format_without_a_name_or_with_a_foreign_id_is_refused() {
    let host = host();
    let nameless = json!({ "id": "a", "name": " ", "conditions": [] });
    let foreign = json!({ "id": "b", "name": "B", "conditions": [] });

    let (nameless_status, _) = put(&host, "/acquisition/formats/a", nameless).await;
    let (foreign_status, _) = put(&host, "/acquisition/formats/a", foreign).await;

    assert_eq!(nameless_status, StatusCode::BAD_REQUEST);
    assert_eq!(foreign_status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_format_that_cannot_compile_names_itself_in_the_refusal() {
    let host = host();
    let empty = json!({ "id": "a", "name": "Empty", "conditions": [] });

    let (status, body) = put(&host, "/acquisition/formats/a", empty).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().starts_with("Empty: "));
}

#[tokio::test]
async fn saved_sizes_are_read_back() {
    let host = host();
    let mut sizes = rules(&host).await["sizes"].clone();
    sizes["episodeRuntime"] = json!(22);

    let (status, body) = put(&host, "/acquisition/sizes", sizes).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "ok": true }));
    assert_eq!(rules(&host).await["sizes"]["episodeRuntime"], 22);
}

#[tokio::test]
async fn a_zero_runtime_is_refused() {
    let host = host();
    let mut sizes = rules(&host).await["sizes"].clone();
    sizes["movieRuntime"] = json!(0);

    let (status, body) = put(&host, "/acquisition/sizes", sizes).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("one minute"));
}

#[tokio::test]
async fn limits_out_of_order_name_their_quality() {
    let host = host();
    let mut sizes = rules(&host).await["sizes"].clone();
    let quality = sizes["movie"][0]["quality"].clone();
    sizes["movie"][0] = json!({ "quality": quality, "min": 10.0, "max": 5.0 });

    let (status, body) = put(&host, "/acquisition/sizes", sizes).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("out of order"));
}

#[tokio::test]
async fn a_title_with_no_files_is_judged_by_the_default_profile() {
    let host = host();

    let (status, body) = get(&host, "/acquisition/titles/movie/603").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["customProfile"], false);
    assert_eq!(body["cutoffUnmet"], false);
    assert_eq!(body["files"], json!([]));
    assert_eq!(body["profileId"], rules(&host).await["defaultProfile"]);
}

#[tokio::test]
async fn a_title_lists_its_judged_files() {
    let host = host();
    seed_movie_file(&host, 603, "/media/Movie.2020.720p.WEB-DL.x264-GRP.mkv");

    let (status, body) = get(&host, "/acquisition/titles/movie/603").await;

    assert_eq!(status, StatusCode::OK);
    let files = body["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["fileId"], "f-603");
    assert_eq!(files[0]["relPath"], "Movie (2020)/movie.mkv");
}

#[tokio::test]
async fn a_title_of_an_unknown_kind_is_refused() {
    let host = host();

    let (status, body) = get(&host, "/acquisition/titles/album/1").await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "unknown kind");
}

#[tokio::test]
async fn a_title_can_pick_a_profile_and_go_back_to_the_default() {
    let host = host();
    let mut profile = rules(&host).await["profiles"][0].clone();
    profile["id"] = json!("kids");
    profile["name"] = json!("Kids");
    put(&host, "/acquisition/profiles/kids", profile).await;

    let (status, _) = put(
        &host,
        "/acquisition/titles/movie/603/profile",
        json!({ "profileId": "kids" }),
    )
    .await;
    let chosen = get(&host, "/acquisition/titles/movie/603").await.1;
    put(&host, "/acquisition/titles/movie/603/profile", json!({})).await;
    let reset = get(&host, "/acquisition/titles/movie/603").await.1;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(chosen["profileId"], "kids");
    assert_eq!(chosen["customProfile"], true);
    assert_eq!(reset["customProfile"], false);
}

#[tokio::test]
async fn a_title_cannot_pick_a_profile_nobody_defined() {
    let host = host();

    let (status, body) = put(
        &host,
        "/acquisition/titles/movie/603/profile",
        json!({ "profileId": "ghost" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("ghost"));
}

#[tokio::test]
async fn a_title_of_an_unknown_kind_cannot_pick_a_profile() {
    let host = host();

    let (status, _) = put(
        &host,
        "/acquisition/titles/album/1/profile",
        json!({ "profileId": null }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_librarian_can_read_the_rules_without_settings_access() {
    let host = host();

    let (status, body) = call(
        routes::<StubHost>(),
        &host,
        "GET",
        "/acquisition/rules",
        Some(LIBRARIAN),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["profiles"].is_array());
}
