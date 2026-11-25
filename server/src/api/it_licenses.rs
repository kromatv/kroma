use axum::http::StatusCode;
use serde_json::Value;

use crate::api::test_support::{get, test_app};

fn entry<'a>(body: &'a Value, name: &str) -> &'a Value {
    body["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["name"] == name)
        .unwrap_or_else(|| panic!("{name} is listed"))
}

#[tokio::test]
async fn lists_the_crates_the_server_links_with_their_texts() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/licenses", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let axum = entry(&body, "axum");
    assert_eq!(axum["kind"], "crate");
    let first = axum["texts"][0].as_u64().unwrap();
    assert!(body["texts"][first as usize].as_str().unwrap().contains("Permission is hereby granted"));
}

#[tokio::test]
async fn leaves_out_the_server_s_own_crates() {
    let t = test_app();

    let (_, body) = get(&t.app, "/api/licenses", Some(&t.token)).await;

    let names: Vec<&str> = body["entries"].as_array().unwrap().iter().filter_map(|e| e["name"].as_str()).collect();
    assert!(!names.iter().any(|name| name.starts_with("kroma-")));
}

#[tokio::test]
async fn asks_for_a_session() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/licenses", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
