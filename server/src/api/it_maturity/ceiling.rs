use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    HeldHousehold, get, hold_at, household_where_the_viewer_is_held_at_ten, send,
};
use crate::model::{
    Audience, MaturityLevel, NotificationEvent, NotificationSpec, NotificationSubject,
};

fn ids(listing: &Value) -> Vec<String> {
    listing
        .as_array()
        .expect("a listing")
        .iter()
        .filter_map(|entry| {
            entry["id"]
                .as_str()
                .or_else(|| entry["item"]["id"].as_str())
                .or_else(|| entry["show"]["id"].as_str())
                .map(str::to_string)
        })
        .collect()
}

async fn listed(h: &HeldHousehold, uri: &str) -> Vec<String> {
    let (status, body) = get(&h.app.app, uri, Some(&h.viewer)).await;
    assert_eq!(status, StatusCode::OK, "{uri}");
    ids(&body)
}

#[tokio::test]
async fn the_library_lists_keep_only_what_passes_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();

    let movies = listed(&h, "/api/movies").await;
    let cards = listed(&h, "/api/movies?view=card").await;
    let shows = listed(&h, "/api/shows").await;
    let items = listed(&h, "/api/items").await;

    assert_eq!(movies, std::slice::from_ref(&h.young_film));
    assert_eq!(cards, std::slice::from_ref(&h.young_film));
    assert_eq!(shows, std::slice::from_ref(&h.young_show));
    assert!(items.contains(&h.young_film) && items.contains(&h.young_episode));
    for hidden in [&h.old_film, &h.unrated_film, &h.old_episode] {
        assert!(!items.contains(hidden), "{hidden} leaked into {items:?}");
    }
}

#[tokio::test]
async fn search_finds_only_what_passes_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();

    let (_, blade) = get(&h.app.app, "/api/search?q=Blade", Some(&h.viewer)).await;
    let (_, office) = get(&h.app.app, "/api/search?q=Office", Some(&h.viewer)).await;
    let (_, spirited) = get(&h.app.app, "/api/search?q=Spirited", Some(&h.viewer)).await;

    assert_eq!(blade["results"], json!([]));
    assert_eq!(office["results"], json!([]));
    let found = spirited["results"].as_array().expect("results");
    assert!(
        found
            .iter()
            .any(|hit| hit["item"]["id"] == json!(h.young_film)),
        "{spirited}"
    );
}

#[tokio::test]
async fn no_home_row_and_no_hero_carries_a_title_above_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();
    let allowed = [h.young_film.clone(), h.young_show.clone()];

    let (status, sections) = get(&h.app.app, "/api/home", Some(&h.viewer)).await;
    let (_, hero) = get(&h.app.app, "/api/home/featured", Some(&h.viewer)).await;

    assert_eq!(status, StatusCode::OK);
    for section in sections.as_array().expect("sections") {
        let entries = ids(&section["items"]);
        assert!(!entries.is_empty(), "an emptied rail must be dropped");
        assert!(entries.iter().all(|id| allowed.contains(id)), "{section}");
    }
    let hero_id = hero["item"]["id"].as_str().or(hero["show"]["id"].as_str());
    assert!(
        hero_id.is_none_or(|id| allowed.iter().any(|a| a == id)),
        "{hero}"
    );
}

#[tokio::test]
async fn the_recommendation_rows_keep_only_what_passes_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();
    let allowed = [h.young_film.clone(), h.young_episode.clone()];

    for uri in [
        "/api/for-you".to_string(),
        "/api/themed?q=space".to_string(),
        format!("/api/items/{}/similar", h.young_film),
    ] {
        let found = listed(&h, &uri).await;
        assert!(
            found.iter().all(|id| allowed.contains(id)),
            "{uri}: {found:?}"
        );
    }
}

const WATCH_STATE: [&str; 4] = [
    "/api/progress",
    "/api/watched",
    "/api/my-list",
    "/api/continue",
];

async fn leave_watch_state_on_hidden_titles(h: &HeldHousehold) {
    for (uri, body) in [
        (
            format!("/api/progress/{}", h.old_episode),
            Some(json!({ "positionMs": 600_000, "durationMs": 3_000_000 })),
        ),
        (format!("/api/watched/{}", h.old_film), None),
        (format!("/api/my-list/{}", h.old_film), None),
        ("/api/my-list/tmdb:603".to_string(), None),
    ] {
        let (status, _) = send(&h.app.app, "PUT", &uri, Some(&h.viewer), body).await;
        assert!(status.is_success(), "{uri}: {status}");
    }
}

async fn watch_state_lengths(h: &HeldHousehold) -> Vec<Option<usize>> {
    let mut lengths = Vec::new();
    for uri in WATCH_STATE {
        let (_, body) = get(&h.app.app, uri, Some(&h.viewer)).await;
        lengths.push(body.as_array().map(Vec::len));
    }
    lengths
}

#[tokio::test]
async fn watch_state_left_on_a_title_the_ceiling_now_hides_is_not_listed() {
    let h = household_where_the_viewer_is_held_at_ten();
    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Adult);
    leave_watch_state_on_hidden_titles(&h).await;
    let before = watch_state_lengths(&h).await;

    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Ten);
    let after = watch_state_lengths(&h).await;

    assert!(
        before.iter().all(|rows| rows.is_some_and(|n| n > 0)),
        "{before:?}"
    );
    assert_eq!(after, vec![Some(0); WATCH_STATE.len()]);
}

#[tokio::test]
async fn a_title_not_held_by_the_server_cannot_be_saved_under_a_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();

    let (status, _) = send(
        &h.app.app,
        "PUT",
        "/api/my-list/tmdb:603",
        Some(&h.viewer),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn at_eighteen_the_same_profile_sees_the_whole_catalogue_again() {
    let h = household_where_the_viewer_is_held_at_ten();
    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Adult);

    let movies = listed(&h, "/api/movies").await;
    let shows = listed(&h, "/api/shows").await;
    let (status, _) = get(
        &h.app.app,
        &format!("/api/items/{}", h.old_film),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(movies.len(), 6);
    assert_eq!(shows.len(), 2);
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_raised_ceiling_bites_on_the_next_request() {
    let h = household_where_the_viewer_is_held_at_ten();
    let uri = format!("/api/items/{}", h.old_film);
    let (before, _) = get(&h.app.app, &uri, Some(&h.viewer)).await;

    hold_at(&h.app.state.db, &h.viewer_id, MaturityLevel::Adult);
    let (after, _) = get(&h.app.app, &uri, Some(&h.viewer)).await;

    assert_eq!(before, StatusCode::NOT_FOUND);
    assert_eq!(after, StatusCode::OK);
}

#[tokio::test]
async fn the_inbox_does_not_announce_a_title_above_the_ceiling() {
    let h = household_where_the_viewer_is_held_at_ten();
    for (title, id) in [
        ("Blade Runner 2049", &h.old_film),
        ("Spirited Away", &h.young_film),
    ] {
        let spec = NotificationSpec::new(
            NotificationEvent::MediaAdded,
            "notifications.media.added.title",
            "notifications.media.addedOne.body",
        )
        .param("title", title)
        .subject(NotificationSubject::movie(id.as_str()));
        crate::services::notify::emit(&h.app.state, &Audience::user(&h.viewer_id), &spec);
    }

    let (status, inbox) = get(&h.app.app, "/api/notifications", Some(&h.viewer)).await;

    assert_eq!(status, StatusCode::OK);
    let subjects: Vec<&Value> = inbox["notifications"]
        .as_array()
        .expect("notifications")
        .iter()
        .map(|row| &row["subject"]["id"])
        .collect();
    assert_eq!(subjects, [&json!(h.young_film)]);
}
