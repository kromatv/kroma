use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    FILM, HeldHousehold, byte_routes, get, household_where_the_viewer_is_held_at_ten, rate_item,
    raw, seed_playable_item, send, ticketed,
};

const UNKNOWN: &str = "no-such-title";

async fn answer(
    h: &HeldHousehold,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    send(&h.app.app, method, uri, Some(&h.viewer), body).await
}

async fn refused_like_an_unknown_id(h: &HeldHousehold, method: &str, route: &str, kept: &str) {
    let body = route
        .contains("ping")
        .then(|| json!({ "sessionId": "s1", "positionMs": 0, "itemId": kept }));
    let unknown_body = body.clone().map(|mut b| {
        b["itemId"] = json!(UNKNOWN);
        b
    });
    let kept_answer = answer(h, method, &route.replace("{id}", kept), body).await;
    let unknown_answer = answer(h, method, &route.replace("{id}", UNKNOWN), unknown_body).await;

    assert_eq!(
        kept_answer.0,
        StatusCode::NOT_FOUND,
        "{method} {route} for {kept}"
    );
    assert_eq!(
        kept_answer, unknown_answer,
        "{method} {route} told the two apart"
    );
}

#[tokio::test]
async fn a_title_above_the_ceiling_is_refused_by_its_id_as_an_unknown_one_is() {
    let h = household_where_the_viewer_is_held_at_ten();

    for (method, route) in [
        ("GET", "/api/items/{id}"),
        ("GET", "/api/items/{id}/metadata"),
        ("GET", "/api/items/{id}/similar"),
        ("GET", "/api/items/{id}/next"),
        ("GET", "/api/items/{id}/following"),
        ("GET", "/api/items/{id}/download"),
        ("GET", "/api/items/{id}/subtitles/downloaded"),
        ("GET", "/api/progress/{id}"),
        ("DELETE", "/api/progress/{id}"),
        ("PUT", "/api/watched/{id}"),
        ("PUT", "/api/my-list/{id}"),
        ("POST", "/api/playback/ping"),
    ] {
        for kept in [&h.old_film, &h.unrated_film, &h.old_episode] {
            refused_like_an_unknown_id(&h, method, route, kept).await;
        }
    }
}

#[tokio::test]
async fn a_show_above_the_ceiling_is_refused_by_its_id_as_an_unknown_one_is() {
    let h = household_where_the_viewer_is_held_at_ten();

    for route in [
        "/api/shows/{id}",
        "/api/shows/{id}/metadata",
        "/api/shows/{id}/up-next",
    ] {
        refused_like_an_unknown_id(&h, "GET", route, &h.old_show).await;
    }
}

#[tokio::test]
async fn a_title_that_passes_is_reached_by_its_id_and_its_episode_by_its_shows_rating() {
    let h = household_where_the_viewer_is_held_at_ten();

    for uri in [
        format!("/api/items/{}", h.young_film),
        format!("/api/items/{}", h.young_episode),
        format!("/api/shows/{}", h.young_show),
    ] {
        let (status, _) = get(&h.app.app, &uri, Some(&h.viewer)).await;
        assert_eq!(status, StatusCode::OK, "{uri}");
    }
}

#[tokio::test]
async fn the_byte_routes_refuse_a_title_above_the_ceiling_by_ticket_and_by_bearer() {
    let h = household_where_the_viewer_is_held_at_ten();
    let kept = seed_playable_item(&h.app.state, "Kept", FILM);
    rate_item(&h.app.state.db, &kept, &[("US", "R")]);

    for uri in byte_routes(&kept) {
        let by_ticket = raw(
            &h.app.app,
            "GET",
            &ticketed(&uri, &h.ticket),
            None,
            None,
            &[],
        )
        .await;
        let by_bearer = raw(&h.app.app, "GET", &uri, Some(&h.viewer), None, &[]).await;
        let unknown = raw(
            &h.app.app,
            "GET",
            &ticketed(&uri.replace(&kept, UNKNOWN), &h.ticket),
            None,
            None,
            &[],
        )
        .await;
        assert_eq!(by_ticket.0, StatusCode::NOT_FOUND, "{uri}");
        assert_eq!(
            (by_ticket.0, &by_ticket.2),
            (unknown.0, &unknown.2),
            "{uri}"
        );
        assert_eq!(
            (by_bearer.0, &by_bearer.2),
            (unknown.0, &unknown.2),
            "{uri}"
        );
    }
}

#[tokio::test]
async fn the_bytes_of_a_title_that_passes_still_stream() {
    let h = household_where_the_viewer_is_held_at_ten();
    let young = seed_playable_item(&h.app.state, "Young", FILM);
    rate_item(&h.app.state.db, &young, &[("US", "G")]);

    let (status, _headers, _) = raw(
        &h.app.app,
        "GET",
        &ticketed(&format!("/api/items/{young}/stream"), &h.ticket),
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_report_on_a_title_above_the_ceiling_is_refused() {
    let h = household_where_the_viewer_is_held_at_ten();

    let (status, _) = answer(
        &h,
        "POST",
        "/api/reports",
        Some(json!({
            "subjectKind": "movie",
            "subjectId": h.old_film,
            "category": "audio",
        })),
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_persons_page_lists_only_the_titles_left() {
    let h = household_where_the_viewer_is_held_at_ten();
    credit(&h, (&h.young_film, 10), &[("US", "PG")]);
    credit(&h, (&h.old_film, 11), &[("US", "R")]);

    let (status, person) = get(
        &h.app.app,
        "/api/people?name=Ada%20Lovelace",
        Some(&h.viewer),
    )
    .await;
    let (_, everyone) = get(
        &h.app.app,
        "/api/people?name=Ada%20Lovelace",
        Some(&h.app.token),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let found: Vec<&Value> = person["results"]
        .as_array()
        .expect("results")
        .iter()
        .map(|hit| &hit["item"]["id"])
        .collect();
    assert_eq!(found, [&json!(h.young_film)]);
    assert_eq!(everyone["results"].as_array().map(Vec::len), Some(2));
}

fn credit(h: &HeldHousehold, (item_id, tmdb_id): (&str, u64), ratings: &[(&str, &str)]) {
    let ratings: serde_json::Map<String, Value> = ratings
        .iter()
        .map(|(country, label)| (country.to_string(), json!(label)))
        .collect();
    let meta = serde_json::from_value(json!({
        "tmdbId": tmdb_id,
        "title": null,
        "overview": null,
        "genres": [],
        "tmdbUrl": "",
        "cast": [{ "name": "Ada Lovelace" }],
        "ratings": ratings,
    }))
    .expect("a credited metadata blob");
    crate::db::set_item_metadata(&h.app.state.db, item_id, &meta).expect("credit the title");
}
