use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    FILM, HeldHousehold, get, household_where_the_viewer_is_held_at_ten, rate_item, raw,
    seed_playable_item, send, ticketed,
};

async fn rated(h: &HeldHousehold, id: &str, rating: &str) {
    let uri = format!("/api/edits/item/{id}");
    let body = json!({ "contentRating": rating });
    let (status, _) = send(&h.app.app, "PUT", &uri, Some(&h.app.token), Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{rating}");
}

async fn streamed(h: &HeldHousehold, id: &str) -> StatusCode {
    let uri = ticketed(&format!("/api/items/{id}/stream"), &h.ticket);
    raw(&h.app.app, "GET", &uri, None, None, &[]).await.0
}

#[tokio::test]
async fn an_age_rating_written_for_a_film_is_the_one_its_ceiling_weighs() {
    let h = household_where_the_viewer_is_held_at_ten();
    let lowered = seed_playable_item(&h.app.state, "Lowered", FILM);
    let raised = h.young_film.clone();
    rate_item(&h.app.state.db, &lowered, &[("US", "R")]);
    rated(&h, &lowered, "Rated G").await;
    rated(&h, &raised, "US-R").await;

    let (_, movies) = get(&h.app.app, "/api/movies", Some(&h.viewer)).await;
    let (opened, _) = get(&h.app.app, &format!("/api/items/{raised}"), Some(&h.viewer)).await;

    let listed: Vec<&str> = movies
        .as_array()
        .expect("a listing")
        .iter()
        .filter_map(|film| film["id"].as_str())
        .collect();
    assert!(listed.contains(&lowered.as_str()), "{listed:?}");
    assert!(!listed.contains(&raised.as_str()), "{listed:?}");
    assert_eq!(opened, StatusCode::NOT_FOUND);
    assert_eq!(streamed(&h, &lowered).await, StatusCode::OK);
}
