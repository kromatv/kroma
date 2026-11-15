//! The handoff in the house the server itself sits in: a television that found
//! the server on its own network, and a browser that left the house and came
//! back in through the tunnel. Their addresses never agree, so the server
//! places them by what it knows of its own house.

use axum::http::StatusCode;
use serde_json::{json, Value};

use super::it_handoff::{announce, from, poll_status};
use crate::api::test_support::{echo_answering, send, test_app, test_app_served_at, TestApp};

const TV_ON_THE_NETWORK: &str = "192.168.1.20";
const THE_HOUSE: &str = "203.0.113.7";
const ANOTHER_HOUSE: &str = "203.0.113.9";

async fn at_home() -> TestApp {
    let t = test_app_served_at(None, Some(&echo_answering("203.0.113.7\n").await));
    t.state
        .direct
        .learn_public_address(&t.state.settings)
        .await;
    t
}

async fn listed_from(t: &TestApp, ip: &str) -> Vec<Value> {
    let (status, list) = from(t, "GET", "/api/handoff/devices", Some(&t.token), None, ip).await;
    assert_eq!(status, StatusCode::OK);
    list.as_array().cloned().unwrap_or_default()
}

async fn grant_from(t: &TestApp, handle: &Value, ip: &str) -> StatusCode {
    let body = json!({ "handle": handle });
    from(t, "POST", "/api/handoff/grant", Some(&t.token), Some(body), ip)
        .await
        .0
}

#[tokio::test]
async fn a_tv_on_the_servers_network_is_listed_to_a_browser_that_came_through_the_tunnel() {
    let t = at_home().await;
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_ON_THE_NETWORK).await;

    let rows = listed_from(&t, THE_HOUSE).await;
    let granted = grant_from(&t, &beacon["handle"], THE_HOUSE).await;

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["name"], json!("Salon"));
    assert_eq!(granted, StatusCode::NO_CONTENT);
    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn a_tv_that_came_through_the_tunnel_is_listed_to_a_phone_on_the_servers_network() {
    let t = at_home().await;
    announce(&t, "tv-salon-01", "Salon", THE_HOUSE).await;

    let rows = listed_from(&t, "192.168.1.50").await;

    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn a_browser_in_another_house_is_shown_nothing_and_may_not_grant() {
    let t = at_home().await;
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_ON_THE_NETWORK).await;

    let rows = listed_from(&t, ANOTHER_HOUSE).await;
    let granted = grant_from(&t, &beacon["handle"], ANOTHER_HOUSE).await;

    assert!(rows.is_empty());
    assert_eq!(granted, StatusCode::NOT_FOUND);
    assert_eq!(poll_status(&t, &beacon).await, "pending");
}

#[tokio::test]
async fn a_server_that_was_never_told_its_public_address_places_nobody_by_it() {
    let t = test_app();
    announce(&t, "tv-salon-01", "Salon", TV_ON_THE_NETWORK).await;

    let rows = listed_from(&t, THE_HOUSE).await;

    assert!(rows.is_empty());
}

#[tokio::test]
async fn with_direct_connections_switched_off_the_house_is_not_used_to_place_anyone() {
    let t = at_home().await;
    let (saved, _) = send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(json!({ "directConnections": false })),
    )
    .await;
    announce(&t, "tv-salon-01", "Salon", TV_ON_THE_NETWORK).await;

    let rows = listed_from(&t, THE_HOUSE).await;

    assert_eq!(saved, StatusCode::OK);
    assert!(rows.is_empty());
}
