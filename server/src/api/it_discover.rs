//! TMDB is never reached: an empty search answers before it, and the rest stop
//! at the missing key.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, test_app_with_tmdb};
use crate::model::Permission;

const READS: [&str; 3] = [
    "/api/discover/search?q=dune",
    "/api/discover/trending?type=movie",
    "/api/discover/movie/603",
];

#[tokio::test]
async fn a_member_holding_no_permission_searches_discover() {
    let t = test_app_with_tmdb();
    let (_, member) = seed_session(&t.state, "ana@t.dev", "ana", &[]);

    let (status, body) = get(&t.app, "/api/discover/search?q=", Some(&member)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "results": [], "page": 1, "totalPages": 1 }));
}

#[tokio::test]
async fn a_member_holding_no_permission_is_past_every_read_gate_but_tmdb() {
    let t = test_app();
    let (_, member) = seed_session(&t.state, "ana@t.dev", "ana", &[]);

    let mut statuses = Vec::new();
    for uri in READS {
        statuses.push(get(&t.app, uri, Some(&member)).await.0);
    }

    assert_eq!(statuses, [StatusCode::SERVICE_UNAVAILABLE; 3]);
}

#[tokio::test]
async fn reading_discover_still_needs_a_session() {
    let t = test_app();

    let mut statuses = Vec::new();
    for uri in READS {
        statuses.push(get(&t.app, uri, None).await.0);
    }

    assert_eq!(statuses, [StatusCode::UNAUTHORIZED; 3]);
}

#[tokio::test]
async fn a_member_who_may_read_discover_still_cannot_request() {
    let t = test_app();
    let (_, member) = seed_session(&t.state, "ana@t.dev", "ana", &[Permission::Playback]);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/requests",
        Some(&member),
        Some(json!({ "kind": "movie", "tmdbId": 45745 })),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}
