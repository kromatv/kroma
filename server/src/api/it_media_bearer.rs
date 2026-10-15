//! The other credential a media byte request may carry: an ordinary session
//! bearer, and the ticket a session is handed alongside it.

use axum::http::StatusCode;

use crate::api::test_support::{
    household_where_the_viewer_only_sees_films, raw, seed_access_token, seed_playable_item, send,
    test_app, ticketed, FILM,
};
use crate::services::media_ticket;

#[tokio::test]
async fn a_session_bearer_still_answers_for_the_bytes_it_may_see() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);

    let (status, _headers, _) = raw(
        &h.app.app,
        "GET",
        &format!("/api/items/{granted}/stream"),
        Some(&h.viewer),
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_bearer_that_is_no_longer_a_session_is_refused_rather_than_read_as_anonymous() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);

    let (status, _headers, _) = raw(
        &h.app.app,
        "GET",
        &ticketed(&format!("/api/items/{granted}/stream"), &h.ticket),
        Some("not-a-session"),
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn every_signed_in_device_is_handed_a_ticket_with_its_session() {
    let t = test_app();
    let access = seed_access_token(&t.state, &t.user_id, true);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(serde_json::json!({ "accessToken": access })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let ticket = body["mediaTicket"].as_str().expect("a media ticket");
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    assert_eq!(
        media_ticket::device_of(&t.state.media_ticket_key, ticket, now),
        Some(crate::services::scan::short_hash(&access))
    );
}
