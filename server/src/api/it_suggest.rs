use std::collections::HashMap;

use axum::http::StatusCode;

use serde_json::json;

use crate::api::test_support::{
    demo_item_id, demo_show_id, get, household_where_the_viewer_only_sees_films, raw, test_app,
    TestApp,
};
use crate::db;

fn configure_an_llm_nobody_answers_at(t: &TestApp) {
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("llmEnabled", json!(true)),
            ("llmProvider", json!("openai")),
            ("llmBaseUrl", json!("http://127.0.0.1:9")),
            ("llmModel", json!("test-model")),
            ("llmApiKey", json!("test-key")),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect(),
    );
}

async fn read_in(t: &TestApp, seed: &str, language: &str) -> serde_json::Value {
    let uri = format!("/api/items/{seed}/ai-suggest");
    let headers = [("accept-language", language)];
    raw(&t.app, "GET", &uri, Some(&t.token), None, &headers)
        .await
        .2
}

#[tokio::test]
async fn a_cached_suggestion_drops_titles_from_libraries_the_caller_cannot_see() {
    let h = household_where_the_viewer_only_sees_films();
    let film = demo_item_id("The Matrix");
    let hidden_show = demo_show_id("The Office");
    db::set_suggestion(
        &h.app.state.db,
        &film,
        &[hidden_show.clone(), film.clone()],
        &HashMap::new(),
        &["en", "fr"],
    )
    .unwrap();

    let (status, body) = get(
        &h.app.app,
        &format!("/api/items/{film}/ai-suggest"),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let ids: Vec<&str> = body["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter_map(|entry| {
            entry["item"]["id"]
                .as_str()
                .or_else(|| entry["show"]["id"].as_str())
        })
        .collect();
    assert!(!ids.contains(&hidden_show.as_str()), "{ids:?}");
}

#[tokio::test]
async fn a_hidden_seed_answers_like_an_unknown_one() {
    let h = household_where_the_viewer_only_sees_films();
    let hidden_show = demo_show_id("The Office");
    let film = demo_item_id("The Matrix");
    db::set_suggestion(
        &h.app.state.db,
        &hidden_show,
        &[film],
        &HashMap::new(),
        &["en", "fr"],
    )
    .unwrap();

    let (status, body) = get(
        &h.app.app,
        &format!("/api/items/{hidden_show}/ai-suggest"),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["items"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_seed_the_catalogue_does_not_hold_is_terminal_and_caches_nothing() {
    let t = test_app();

    let (status, body) =
        get(&t.app, "/api/items/no-such-item/ai-suggest", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "ai:suggest");
    assert_eq!(body["items"].as_array().map(Vec::len), Some(0));
    assert!(db::get_suggestion(&t.state.db, "no-such-item")
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn a_seed_with_nothing_cached_yet_answers_null_so_the_client_keeps_polling() {
    let t = test_app();
    configure_an_llm_nobody_answers_at(&t);
    let id = demo_item_id("The Matrix");

    let (status, body) = get(
        &t.app,
        &format!("/api/items/{id}/ai-suggest"),
        Some(&t.token),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body.is_null(), "{body}");
}

#[tokio::test]
async fn a_server_without_an_llm_answers_an_empty_section_instead_of_pending() {
    let t = test_app();
    let id = demo_item_id("The Matrix");

    let (status, body) = get(
        &t.app,
        &format!("/api/items/{id}/ai-suggest"),
        Some(&t.token),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "ai:suggest");
    assert_eq!(body["items"].as_array().map(Vec::len), Some(0));
    assert!(db::get_suggestion(&t.state.db, &id).unwrap().is_none());
}

#[tokio::test]
async fn a_reader_of_a_regional_locale_is_served_the_row_asked_for_its_language() {
    let t = test_app();
    configure_an_llm_nobody_answers_at(&t);
    let seed = demo_item_id("Sintel");
    let member = demo_item_id("Islands");
    db::set_suggestion(&t.state.db, &seed, &[member], &HashMap::new(), &["fr"]).unwrap();

    let body = read_in(&t, &seed, "fr-CH").await;

    assert_eq!(body["items"].as_array().map(Vec::len), Some(1), "{body}");
}

#[tokio::test]
async fn a_row_never_asked_for_the_readers_language_is_a_miss() {
    let t = test_app();
    configure_an_llm_nobody_answers_at(&t);
    let seed = demo_item_id("Big Buck Bunny");
    let member = demo_item_id("Islands");
    db::set_suggestion(&t.state.db, &seed, &[member], &HashMap::new(), &["fr"]).unwrap();

    let body = read_in(&t, &seed, "en").await;

    assert!(body.is_null(), "{body}");
}

#[tokio::test]
async fn a_row_never_asked_for_the_readers_language_is_served_as_it_is_without_a_model() {
    let t = test_app();
    let seed = demo_item_id("Mountains");
    let member = demo_item_id("Islands");
    db::set_suggestion(&t.state.db, &seed, &[member], &HashMap::new(), &["fr"]).unwrap();

    let body = read_in(&t, &seed, "en").await;

    assert_eq!(body["items"].as_array().map(Vec::len), Some(1), "{body}");
}
