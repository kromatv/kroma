use serde_json::json;

use crate::api::test_support::{get, test_app};

#[tokio::test]
async fn search_answers_cards_when_asked_and_whole_titles_otherwise() {
    let t = test_app();

    let (_, whole) = get(&t.app, "/api/search?q=matrix", Some(&t.token)).await;
    let (_, cards) = get(&t.app, "/api/search?q=matrix&view=card", Some(&t.token)).await;

    assert_eq!(whole["results"][0]["type"], json!("movie"));
    assert!(whole["results"][0]["item"]["files"].is_array());
    assert_eq!(cards["results"][0]["type"], json!("movie"));
    assert_eq!(cards["results"][0]["item"].get("files"), None);
    assert_eq!(cards["results"][0]["item"]["id"], whole["results"][0]["item"]["id"]);
}
