use axum::http::header::{CONTENT_LENGTH, CONTENT_RANGE};
use axum::http::StatusCode;

use crate::api::test_support::{
    demo_item_id, demo_library_ids, grant_libraries, media_ticket_for, raw, seed_playable_item,
    seed_session, test_app, TestApp,
};
use crate::model::Permission;
use crate::services::media_ticket;

const FILM: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

struct Household {
    app: TestApp,
    viewer: String,
    ticket: String,
    episode: String,
}

fn household_where_the_viewer_only_sees_films() -> Household {
    let app = test_app();
    let (viewer_id, viewer) = seed_session(
        &app.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );
    let (movies_lib, _shows_lib) = demo_library_ids();
    grant_libraries(&app.state, &viewer_id, &[movies_lib]);
    let ticket = media_ticket_for(&app.state, &viewer);

    Household {
        app,
        viewer,
        ticket,
        episode: demo_item_id("Islands"),
    }
}

fn byte_routes(item: &str) -> Vec<String> {
    vec![
        format!("/api/items/{item}/stream"),
        format!("/api/items/{item}/hls/copy/0/0/index.m3u8"),
        format!("/api/items/{item}/hls/copy/0/0/init.mp4"),
        format!("/api/items/{item}/storyboard"),
        format!("/api/items/{item}/storyboard.img"),
        format!("/api/items/{item}/subtitles/0"),
        format!("/api/items/{item}/subtitles/dl/anything.vtt"),
    ]
}

fn ticketed(uri: &str, ticket: &str) -> String {
    let join = if uri.contains('?') { '&' } else { '?' };
    format!("{uri}{join}t={ticket}")
}

fn device_of(h: &Household) -> String {
    crate::db::session_device_id(&h.app.state.db, &h.viewer)
        .expect("read the session's device")
        .expect("a session minted from an access token")
}

#[tokio::test]
async fn a_request_for_bytes_that_carries_no_credential_at_all_is_refused() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);

    for uri in byte_routes(&granted) {
        let (status, _headers, _) = raw(&h.app.app, "GET", &uri, None, None, &[]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri} should refuse");
    }
}

#[tokio::test]
async fn a_ticket_reaches_the_bytes_of_a_title_its_account_was_granted() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);

    let (status, headers, _) = raw(
        &h.app.app,
        "GET",
        &ticketed(&format!("/api/items/{granted}/stream"), &h.ticket),
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[CONTENT_LENGTH], FILM.len().to_string());
}

#[tokio::test]
async fn a_ticket_does_not_reach_a_title_outside_its_accounts_grant() {
    let h = household_where_the_viewer_only_sees_films();

    for uri in byte_routes(&h.episode) {
        let (status, _headers, _) = raw(
            &h.app.app,
            "GET",
            &ticketed(&uri, &h.ticket),
            None,
            None,
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri} should refuse");
    }
}

#[tokio::test]
async fn each_accounts_ticket_carries_that_accounts_grant_and_no_other() {
    let t = test_app();
    let (films_id, films_viewer) = seed_session(&t.state, "films@test.dev", "films", &[]);
    let (series_id, series_viewer) = seed_session(&t.state, "series@test.dev", "series", &[]);
    let (movies_lib, shows_lib) = demo_library_ids();
    grant_libraries(&t.state, &films_id, &[movies_lib]);
    grant_libraries(&t.state, &series_id, &[shows_lib]);
    let episode = demo_item_id("Islands");
    let film = seed_playable_item(&t.state, "Granted", FILM);

    let films_ticket = media_ticket_for(&t.state, &films_viewer);
    let series_ticket = media_ticket_for(&t.state, &series_viewer);
    let film_uri = format!("/api/items/{film}/stream");
    let episode_uri = format!("/api/items/{episode}/storyboard");

    let (own, _, _) = raw(
        &t.app,
        "GET",
        &ticketed(&film_uri, &films_ticket),
        None,
        None,
        &[],
    )
    .await;
    let (borrowed, _, _) = raw(
        &t.app,
        "GET",
        &ticketed(&film_uri, &series_ticket),
        None,
        None,
        &[],
    )
    .await;
    let (theirs, _, _) = raw(
        &t.app,
        "GET",
        &ticketed(&episode_uri, &films_ticket),
        None,
        None,
        &[],
    )
    .await;

    assert_eq!(own, StatusCode::OK);
    assert_eq!(borrowed, StatusCode::NOT_FOUND);
    assert_eq!(theirs, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_ticket_that_has_run_out_is_refused() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);
    let long_ago = time::OffsetDateTime::now_utc().unix_timestamp() - media_ticket::TTL_SECS - 1;
    let lapsed = media_ticket::mint(&h.app.state.media_ticket_key, &device_of(&h), long_ago);

    let uri = ticketed(&format!("/api/items/{granted}/stream"), &lapsed);
    let (status, _headers, _) = raw(&h.app.app, "GET", &uri, None, None, &[]).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_ticket_this_install_never_signed_is_refused() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);
    let device = device_of(&h);
    let now = time::OffsetDateTime::now_utc().unix_timestamp();

    for ticket in [
        media_ticket::mint("a-key-this-install-never-held", &device, now),
        format!("{device}.9999999999.0123456789abcdef0123456789abcdef"),
        "nonsense".to_string(),
    ] {
        let uri = ticketed(&format!("/api/items/{granted}/stream"), &ticket);
        let (status, _headers, _) = raw(&h.app.app, "GET", &uri, None, None, &[]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{ticket} should refuse");
    }
}

#[tokio::test]
async fn a_ticket_a_revoked_device_left_behind_stops_working() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);
    let uri = ticketed(&format!("/api/items/{granted}/stream"), &h.ticket);
    let (before, _headers, _) = raw(&h.app.app, "GET", &uri, None, None, &[]).await;

    let viewer_id = crate::db::session_user(&h.app.state.db, &h.viewer)
        .expect("read the session")
        .expect("a live session")
        .id;
    let revoked =
        crate::db::delete_access_token_by_id(&h.app.state.db, &viewer_id, &device_of(&h)).unwrap();
    let (after, _headers, _) = raw(&h.app.app, "GET", &uri, None, None, &[]).await;

    assert_eq!(before, StatusCode::OK);
    assert!(revoked);
    assert_eq!(after, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_range_request_partway_through_a_film_is_answered_for_the_same_ticket() {
    let h = household_where_the_viewer_only_sees_films();
    let granted = seed_playable_item(&h.app.state, "Granted", FILM);
    let uri = ticketed(&format!("/api/items/{granted}/stream"), &h.ticket);

    let (first, first_headers, _) = raw(
        &h.app.app,
        "GET",
        &uri,
        None,
        None,
        &[("range", "bytes=0-7")],
    )
    .await;
    let (later, later_headers, _) = raw(
        &h.app.app,
        "GET",
        &uri,
        None,
        None,
        &[("range", "bytes=20-27")],
    )
    .await;

    assert_eq!(first, StatusCode::PARTIAL_CONTENT);
    assert_eq!(later, StatusCode::PARTIAL_CONTENT);
    assert_eq!(first_headers[CONTENT_RANGE], "bytes 0-7/36");
    assert_eq!(later_headers[CONTENT_RANGE], "bytes 20-27/36");
}

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
    let access = crate::api::test_support::seed_access_token(&t.state, &t.user_id, true);

    let (status, body) = crate::api::test_support::send(
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
