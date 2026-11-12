//! Integration tests for the person lookup and details handlers (`people.rs`).

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    demo_item_id, demo_library_ids, demo_show_id, get, test_app, test_app_with_tmdb,
};
use serde_json::Value;

#[tokio::test]
async fn people_lookup_accepts_a_library_scope() {
    let t = test_app();
    // Demo carries no cast, so this is an empty-but-200 envelope; it exercises the
    // library-scoped query path.
    let (status, body): (StatusCode, Value) = get(
        &t.app,
        "/api/people?name=Nobody&library=ghost",
        Some(&t.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Nobody"));
    assert_eq!(body["results"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn people_lookup_with_a_blank_name_is_an_empty_envelope() {
    let t = test_app();
    // No `name` -> short-circuits to an empty result set before any query.
    let (status, body): (StatusCode, Value) = get(&t.app, "/api/people", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!(""));
    assert_eq!(body["results"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn people_lookup_merges_movie_and_show_credits() {
    let t = test_app();
    // Inject a shared cast credit onto one movie + one show (the demo blob is
    // otherwise empty), so the person query returns both and `collect` merges +
    // sorts them into one hit list.
    let movie = demo_item_id("The Matrix");
    let show = demo_show_id("The Office");
    let cast = r#"{"tmdbId":1,"tmdbUrl":"","genres":[],"cast":[{"name":"Ada Lovelace"}]}"#;
    {
        let conn = t.state.db.get().unwrap();
        conn.execute(
            "UPDATE items SET metadata = ?2 WHERE id = ?1",
            (movie.as_str(), cast),
        )
        .unwrap();
        conn.execute(
            "UPDATE shows SET metadata = ?2 WHERE id = ?1",
            (show.as_str(), cast),
        )
        .unwrap();
    }

    let (status, body): (StatusCode, Value) =
        get(&t.app, "/api/people?name=Ada%20Lovelace", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Ada Lovelace"));
    let results = body["results"].as_array().expect("results");
    assert_eq!(results.len(), 2, "both the movie and show credit surface");
    assert!(results.iter().any(|r| r["type"] == json!("movie")));
    assert!(results.iter().any(|r| r["type"] == json!("show")));

    let matrix_lib = demo_library_ids().0;
    let (_, scoped): (StatusCode, Value) = get(
        &t.app,
        &format!("/api/people?name=Ada%20Lovelace&library={matrix_lib}"),
        Some(&t.token),
    )
    .await;
    assert_eq!(scoped["results"].as_array().map(Vec::len), Some(1));
    assert_eq!(scoped["results"][0]["type"], json!("movie"));
}

#[tokio::test]
async fn a_person_slug_resolves_to_the_credit_it_was_folded_from() {
    let t = test_app();
    let movie = demo_item_id("The Matrix");
    let cast = r#"{"tmdbId":1,"tmdbUrl":"","genres":[],"cast":[{"name":"Timothée Chalamet"}]}"#;
    {
        let conn = t.state.db.get().unwrap();
        conn.execute(
            "UPDATE items SET metadata = ?2 WHERE id = ?1",
            (movie.as_str(), cast),
        )
        .unwrap();
    }

    let (status, body): (StatusCode, Value) =
        get(&t.app, "/api/people?name=timothee-chalamet", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Timothée Chalamet"));
    assert_eq!(body["results"].as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn a_person_id_answers_ahead_of_any_name() {
    let t = test_app();
    let movie = demo_item_id("The Matrix");
    let cast =
        r#"{"tmdbId":1,"tmdbUrl":"","genres":[],"cast":[{"name":"Keanu Reeves","tmdbId":6384}]}"#;
    {
        let conn = t.state.db.get().unwrap();
        conn.execute(
            "UPDATE items SET metadata = ?2 WHERE id = ?1",
            (movie.as_str(), cast),
        )
        .unwrap();
    }

    let (status, body): (StatusCode, Value) =
        get(&t.app, "/api/people?name=6384", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Keanu Reeves"));
    assert_eq!(body["results"].as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn person_details_are_a_soft_miss_without_a_provider() {
    let t = test_app(); // no TMDB key configured
    let (status, body): (StatusCode, Value) = get(
        &t.app,
        "/api/people/details?name=Ada%20Lovelace",
        Some(&t.token),
    )
    .await;
    // A biography nobody can fetch is not an error: the page still has a
    // filmography to render, so the envelope comes back with a null person.
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!("Ada Lovelace"));
    assert_eq!(body["person"], Value::Null);
}

#[tokio::test]
async fn person_details_with_a_blank_name_never_reaches_the_provider() {
    let t = test_app_with_tmdb();
    let (status, body): (StatusCode, Value) =
        get(&t.app, "/api/people/details", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], json!(""));
    assert_eq!(body["person"], Value::Null);
}
