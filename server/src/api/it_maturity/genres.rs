use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    HeldHousehold, get, hold_at, household_where_the_viewer_is_held_at_ten, of_genres,
};
use crate::model::MaturityLevel;

const ACTION: u32 = 28;
const CRIME: u32 = 80;
const KIDS: u32 = 10762;

async fn status_of(h: &HeldHousehold, uri: &str) -> StatusCode {
    get(&h.app.app, uri, Some(&h.viewer)).await.0
}

async fn body_of(h: &HeldHousehold, uri: &str) -> Value {
    get(&h.app.app, uri, Some(&h.viewer)).await.1
}

#[tokio::test]
async fn a_kids_level_keeps_a_film_rated_for_all_that_is_not_made_for_children_from_every_route() {
    let h = household_where_the_viewer_is_held_at_ten();
    of_genres(&h.app.state.db, (&h.young_film, false), &[ACTION]);

    let movies = body_of(&h, "/api/movies").await;
    let by_id = status_of(&h, &format!("/api/items/{}", h.young_film)).await;
    let search = body_of(&h, "/api/search?q=Spirited").await;

    assert_eq!(movies, json!([]));
    assert_eq!(by_id, StatusCode::NOT_FOUND);
    assert_eq!(search["results"], json!([]));
}

#[tokio::test]
async fn an_episode_answers_through_its_shows_genres() {
    let h = household_where_the_viewer_is_held_at_ten();
    of_genres(&h.app.state.db, (&h.young_show, true), &[KIDS, CRIME]);

    let episode = status_of(&h, &format!("/api/items/{}", h.young_episode)).await;
    let show = status_of(&h, &format!("/api/shows/{}", h.young_show)).await;

    assert_eq!(
        (episode, show),
        (StatusCode::NOT_FOUND, StatusCode::NOT_FOUND)
    );
}

#[tokio::test]
async fn a_profile_at_thirteen_weighs_the_rating_alone() {
    let h = household_where_the_viewer_is_held_at_ten();
    of_genres(&h.app.state.db, (&h.young_film, false), &[ACTION]);
    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Thirteen);

    let by_id = status_of(&h, &format!("/api/items/{}", h.young_film)).await;

    assert_eq!(by_id, StatusCode::OK);
}
