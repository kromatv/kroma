//! Integration tests for the read-only content endpoints: browse, search,
//! people, home, recommendations, per-user playback, metadata and discover.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    demo_item_id, demo_show_id, get, raw, seed_session, send, test_app, test_app_with_tmdb,
};
use crate::model::Permission;

#[tokio::test]
async fn content_routes_reject_anonymous_callers() {
    let t = test_app();
    for uri in [
        "/api/movies",
        "/api/shows",
        "/api/libraries",
        "/api/home",
        "/api/home/featured",
        "/api/search?q=x",
    ] {
        let (status, _) = get(&t.app, uri, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri} should require a session");
    }
}

#[tokio::test]
async fn content_routes_reject_a_bogus_bearer() {
    let t = test_app();
    let (status, _) = get(&t.app, "/api/items", Some("definitely-not-a-session")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn module_proxy_404s_an_unknown_module() {
    let t = test_app();
    let (status, _) = get(&t.app, "/api/module/ghost/anything", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn spa_cache_headers_tag_hashed_assets_immutable() {
    let t = test_app();

    let (_s, headers, _) = raw(&t.app, "GET", "/some-spa-route", None, None, &[]).await;
    assert_eq!(
        headers.get("cache-control").and_then(|v| v.to_str().ok()),
        Some("no-cache"),
    );

    // A Vite content-hashed asset name.
    let (_s, headers, _) = raw(&t.app, "GET", "/assets/index-DXQwrN_7.js", None, None, &[]).await;
    assert_eq!(
        headers.get("cache-control").and_then(|v| v.to_str().ok()),
        Some("public, max-age=31536000, immutable"),
    );

    let (_s, headers, _) = raw(&t.app, "GET", "/api/health", None, None, &[]).await;
    assert!(headers.get("cache-control").is_none());
}

#[tokio::test]
async fn libraries_movies_and_shows_list_the_demo_catalogue() {
    let t = test_app();

    let (status, libs) = get(&t.app, "/api/libraries", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(libs.as_array().map(Vec::len), Some(2));

    let (status, movies) = get(&t.app, "/api/movies", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(movies.as_array().map(Vec::len), Some(6));
    assert!(movies.as_array().unwrap().iter().any(|m| m["title"] == json!("The Matrix")));

    let (status, shows) = get(&t.app, "/api/shows", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(shows.as_array().map(Vec::len), Some(2));
}

#[tokio::test]
async fn item_detail_returns_the_seeded_item_and_404s_the_unknown() {
    let t = test_app();
    let id = demo_item_id("The Matrix");

    let (status, item) = get(&t.app, &format!("/api/items/{id}"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(item["id"], json!(id));
    assert_eq!(item["title"], json!("The Matrix"));

    let (status, _) = get(&t.app, "/api/items/does-not-exist", Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn show_detail_returns_the_show_with_seasons() {
    let t = test_app();
    let id = demo_show_id("The Office");

    let (status, detail) = get(&t.app, &format!("/api/shows/{id}"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(detail["show"]["title"], json!("The Office"));
    assert!(detail["seasons"].is_array());

    let (status, _) = get(&t.app, "/api/shows/nope", Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn search_finds_a_seeded_title() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/search?q=Matrix", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["query"], json!("Matrix"));
    let results = body["results"].as_array().expect("results array");
    assert!(
        results.iter().any(|r| r["type"] == json!("movie") && r["item"]["title"] == json!("The Matrix")),
        "expected 'The Matrix' among results: {results:?}"
    );
}

#[tokio::test]
async fn search_with_a_blank_query_is_an_empty_ok() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/search?q=%20", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["results"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn people_lookup_returns_an_ok_envelope() {
    let t = test_app();
    // Demo items carry no cast metadata, so the match is empty by construction.
    let (status, body) = get(&t.app, "/api/people?name=Keanu%20Reeves", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Keanu Reeves"));
    assert_eq!(body["results"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn home_returns_an_ordered_section_list() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/home", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.is_array(), "home is a Section[]");
}

#[tokio::test]
async fn featured_returns_one_tagged_entry_from_the_demo_catalogue() {
    let t = test_app();
    let (status, body) = get(&t.app, "/api/home/featured", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let tag = body["type"].as_str().expect("a SectionItem");
    assert!(tag == "movie" || tag == "show", "unexpected tag {tag}");
    // The pick is stable within a request day.
    let (_, again) = get(&t.app, "/api/home/featured", Some(&t.token)).await;
    assert_eq!(body, again);
}

#[tokio::test]
async fn similar_and_for_you_are_ok_arrays() {
    let t = test_app();
    let id = demo_item_id("The Matrix");

    let (status, similar) = get(&t.app, &format!("/api/items/{id}/similar"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(similar.is_array());

    let (status, for_you) = get(&t.app, "/api/for-you", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(for_you.is_array());
}

#[tokio::test]
async fn progress_round_trips_per_user() {
    let t = test_app();
    let id = demo_item_id("Dune Part Two");

    let (status, list) = get(&t.app, "/api/progress", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    let (status, _) = send(
        &t.app,
        "PUT",
        &format!("/api/progress/{id}"),
        Some(&t.token),
        Some(json!({ "positionMs": 60_000, "durationMs": 9_960_000 })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, entry) = get(&t.app, &format!("/api/progress/{id}"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(entry["itemId"], json!(id));
    assert_eq!(entry["positionMs"], json!(60_000));

    let (status, list) = get(&t.app, "/api/progress", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(1));

    let (status, _) = send(&t.app, "DELETE", &format!("/api/progress/{id}"), Some(&t.token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/progress", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn continue_and_watched_lists_start_empty() {
    let t = test_app();

    let (status, cont) = get(&t.app, "/api/continue", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cont.as_array().map(Vec::len), Some(0));

    let (status, watched) = get(&t.app, "/api/watched", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(watched.as_array().map(Vec::len), Some(0));

    let (status, my_list) = get(&t.app, "/api/my-list", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(my_list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn my_list_add_then_remove() {
    let t = test_app();
    let id = demo_item_id("Spirited Away");

    let (status, _) = send(&t.app, "PUT", &format!("/api/my-list/{id}"), Some(&t.token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/my-list", Some(&t.token)).await;
    assert_eq!(list, json!([id]));

    let (status, _) = send(&t.app, "DELETE", &format!("/api/my-list/{id}"), Some(&t.token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/my-list", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn item_metadata_is_unavailable_without_a_tmdb_key() {
    let t = test_app();
    let id = demo_item_id("The Matrix");
    // No TMDB key in the test config, so this short-circuits before any network call.
    let (status, _) = get(&t.app, &format!("/api/items/{id}/metadata"), Some(&t.token)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn metadata_404s_unknown_ids_once_a_key_is_configured() {
    // The fake key clears the TMDB gate; the unknown id then 404s at the DB
    // lookup, before any network fetch.
    let t = test_app_with_tmdb();
    let (status, _) = get(&t.app, "/api/items/no-such-item/metadata", Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = get(&t.app, "/api/shows/no-such-show/metadata", Some(&t.token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn discover_is_gated_by_permission_then_by_tmdb() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/discover/search?q=dune", Some(&t.token)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (_, member) = seed_session(&t.state, "viewer@test.dev", "viewer", &[Permission::Playback]);
    let (status, _) = get(&t.app, "/api/discover/search?q=dune", Some(&member)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn discover_trending_and_detail_follow_the_same_gates() {
    let t = test_app();
    let (_, member) = seed_session(&t.state, "viewer2@test.dev", "viewer2", &[Permission::Playback]);

    let (status, _) = get(&t.app, "/api/discover/trending?type=movie", Some(&t.token)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    let (status, _) = get(&t.app, "/api/discover/trending", Some(&member)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = get(&t.app, "/api/discover/movie/603", Some(&t.token)).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    let (status, _) = get(&t.app, "/api/discover/movie/603", Some(&member)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
