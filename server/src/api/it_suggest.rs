use std::collections::HashMap;

use axum::http::StatusCode;

use crate::api::test_support::{
    demo_item_id, demo_show_id, get, household_where_the_viewer_only_sees_films,
};
use crate::db;

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
    db::set_suggestion(&h.app.state.db, &hidden_show, &[film], &HashMap::new()).unwrap();

    let (status, body) = get(
        &h.app.app,
        &format!("/api/items/{hidden_show}/ai-suggest"),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["items"].as_array().map(Vec::len), Some(0));
}
