use axum::http::StatusCode;
use kroma_module_sdk::host::HostStorage;
use serde_json::json;

use super::test_support::{call, host, row, seed, with_definition};
use crate::admin::KIND_BUILTIN;
use crate::db;

#[tokio::test]
async fn listing_shows_rows_without_their_secrets() {
    let host = host();
    seed(&host, &row("a", "torznab"));

    let (status, body) = call(&host, "GET", "/indexers", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["indexers"][0]["id"], "a");
    assert_eq!(body["indexers"][0]["hasApiKey"], true);
    assert_eq!(
        body["indexers"][0]["configuredSettings"],
        json!(["password", "username"])
    );
    assert!(!body.to_string().contains("SECRET"));
}

#[tokio::test]
async fn creating_a_torznab_indexer_stores_a_trimmed_row() {
    let host = host();

    let (status, body) = call(
        &host,
        "POST",
        "/indexers",
        json!({ "name": "  Jack  ", "url": " http://jackett.example/api ", "apiKey": " k " }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Jack");
    let id = body["id"].as_str().unwrap();
    let stored = db::get_indexer(&host.store().get().unwrap(), id)
        .unwrap()
        .unwrap();
    assert_eq!(stored.url, "http://jackett.example/api");
    assert_eq!(stored.api_key, "k");
    assert_eq!(stored.categories, vec![2000, 5000]);
}

#[tokio::test]
async fn creating_a_torznab_indexer_without_a_url_is_refused() {
    let host = host();

    let (status, _) = call(&host, "POST", "/indexers", json!({ "name": "Jack" })).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn creating_a_builtin_indexer_takes_its_link_and_name_from_the_definition() {
    let host = with_definition(host());

    let (status, body) = call(
        &host,
        "POST",
        "/indexers",
        json!({ "kind": "builtin", "definitionId": "demo", "settings": { "username": "ana" } }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["kind"], KIND_BUILTIN);
    assert_eq!(body["name"], "Demo Tracker");
    assert_eq!(body["configuredSettings"], json!(["username"]));
}

#[tokio::test]
async fn creating_a_builtin_indexer_lets_the_admin_override_the_link_and_name() {
    let host = with_definition(host());

    let (_, body) = call(
        &host,
        "POST",
        "/indexers",
        json!({
            "kind": "builtin",
            "definitionId": "demo",
            "name": "Mine",
            "url": "http://mirror.example/",
            "enabled": false,
            "priority": 7,
            "categories": [5000],
        }),
    )
    .await;

    assert_eq!(body["name"], "Mine");
    assert_eq!(body["url"], "http://mirror.example/");
    assert_eq!(body["enabled"], false);
    assert_eq!(body["priority"], 7);
    assert_eq!(body["categories"], json!([5000]));
}

#[tokio::test]
async fn creating_a_builtin_indexer_needs_a_known_definition() {
    let host = host();

    let (missing, _) = call(&host, "POST", "/indexers", json!({ "kind": "builtin" })).await;
    let (unknown, _) = call(
        &host,
        "POST",
        "/indexers",
        json!({ "kind": "builtin", "definitionId": "../etc" }),
    )
    .await;

    assert_eq!(missing, StatusCode::BAD_REQUEST);
    assert_eq!(unknown, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn updating_an_indexer_changes_only_the_given_fields() {
    let host = host();
    seed(&host, &row("a", "torznab"));

    let (status, body) = call(
        &host,
        "PUT",
        "/indexers/a",
        json!({ "name": " Renamed ", "priority": 3 }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Renamed");
    assert_eq!(body["priority"], 3);
    assert_eq!(body["url"], "http://127.0.0.1:1/");
}

#[tokio::test]
async fn updating_settings_keeps_a_stored_password_when_the_incoming_one_is_empty() {
    let host = with_definition(host());
    seed(&host, &row("b", KIND_BUILTIN));

    let (status, _) = call(
        &host,
        "PUT",
        "/indexers/b",
        json!({ "settings": { "password": "", "username": "bob" } }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let stored = db::get_indexer(&host.store().get().unwrap(), "b")
        .unwrap()
        .unwrap();
    let settings: serde_json::Value = serde_json::from_str(&stored.settings).unwrap();
    assert_eq!(
        settings,
        json!({ "username": "bob", "password": "hunter2" })
    );
}

#[tokio::test]
async fn updating_an_indexer_that_is_gone_is_not_found() {
    let host = host();

    let (plain, _) = call(&host, "PUT", "/indexers/ghost", json!({ "name": "x" })).await;
    let (merge, _) = call(
        &host,
        "PUT",
        "/indexers/ghost",
        json!({ "settings": { "a": "b" } }),
    )
    .await;

    assert_eq!(plain, StatusCode::NOT_FOUND);
    assert_eq!(merge, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn removing_an_indexer_deletes_it_once() {
    let host = host();
    seed(&host, &row("a", "torznab"));

    let (first, body) = call(&host, "DELETE", "/indexers/a", json!({})).await;
    let (second, _) = call(&host, "DELETE", "/indexers/a", json!({})).await;

    assert_eq!(first, StatusCode::OK);
    assert_eq!(body["ok"], true);
    assert_eq!(second, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn testing_an_indexer_that_is_gone_is_not_found() {
    let host = host();

    let (status, _) = call(&host, "POST", "/indexers/ghost/test", json!({})).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn testing_a_torznab_indexer_nobody_answers_for_reports_the_failure() {
    let host = host();
    seed(&host, &row("a", "torznab"));

    let (status, body) = call(&host, "POST", "/indexers/a/test", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], false);
    assert!(body["error"].as_str().is_some_and(|e| !e.is_empty()));
}

#[tokio::test]
async fn testing_a_builtin_indexer_that_needs_no_login_reports_success() {
    let host = with_definition(host());
    seed(&host, &row("b", KIND_BUILTIN));

    let (status, body) = call(&host, "POST", "/indexers/b/test", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["ok"], true);
}

#[tokio::test]
async fn the_definition_catalog_is_empty_until_synced_then_lists_the_cache() {
    let host = host();

    let (_, before) = call(&host, "GET", "/indexers/definitions", json!({})).await;
    let host = with_definition(host);
    let (_, after) = call(&host, "GET", "/indexers/definitions", json!({})).await;

    assert_eq!(before["synced"], false);
    assert_eq!(after["synced"], true);
    assert_eq!(after["definitions"][0]["id"], "demo");
    assert_eq!(after["definitions"][0]["name"], "Demo Tracker");
}

#[tokio::test]
async fn a_definition_detail_carries_its_settings_form() {
    let host = with_definition(host());

    let (status, body) = call(&host, "GET", "/indexers/definitions/demo", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["settings"][0]["name"], "username");
    assert_eq!(body["settings"][0]["label"], "Login");
    assert_eq!(body["settings"][1]["label"], "password");
}

#[tokio::test]
async fn a_definition_nobody_has_is_not_found() {
    let host = host();

    let (status, _) = call(&host, "GET", "/indexers/definitions/nope", json!({})).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
