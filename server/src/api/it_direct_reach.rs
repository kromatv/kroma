use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    HOUSEHOLD_PUBLIC_IP, NEIGHBOUR, TestApp, get, get_from, offer, offer_through_the_tunnel, raw,
    send, test_app, test_app_served_at,
};

async fn echo_answering(address: &'static str) -> String {
    let app = axum::Router::new().route("/", axum::routing::get(move || async move { address }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}/")
}

async fn preflight(t: &TestApp, origin: &str) -> axum::http::HeaderMap {
    let (_, headers, _) = raw(
        &t.app,
        "OPTIONS",
        "/api/media/home",
        None,
        None,
        &[
            ("origin", origin),
            ("access-control-request-method", "GET"),
            ("access-control-request-headers", "authorization"),
        ],
    )
    .await;
    headers
}

#[tokio::test]
async fn a_neighbour_is_on_the_same_network() {
    let t = test_app();

    let (_, _, body) = get_from(&t.app, NEIGHBOUR, "/api/server/direct", Some(&t.token), &[]).await;

    assert_eq!(body["sameNetwork"], json!(true));
}

#[tokio::test]
async fn a_caller_from_the_internet_is_not_when_the_public_address_is_unknown() {
    let t = test_app();

    let body = offer_through_the_tunnel(&t, HOUSEHOLD_PUBLIC_IP).await;

    assert_eq!(body["sameNetwork"], json!(false));
}

#[tokio::test]
async fn a_caller_leaving_through_the_households_address_is_on_the_same_network() {
    let home = test_app_served_at(None, Some(&echo_answering("81.2.69.160\n").await));
    let elsewhere = test_app_served_at(None, Some(&echo_answering("81.2.69.161").await));

    let at_home = offer_through_the_tunnel(&home, HOUSEHOLD_PUBLIC_IP).await;
    let away = offer_through_the_tunnel(&elsewhere, HOUSEHOLD_PUBLIC_IP).await;

    assert_eq!(at_home["sameNetwork"], json!(true));
    assert_eq!(away["sameNetwork"], json!(false));
}

#[tokio::test]
async fn the_switch_off_offers_no_route() {
    let t = test_app();

    let (saved, _) = send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(json!({ "directConnections": false })),
    )
    .await;
    let body = offer(&t).await;

    assert_eq!(saved, StatusCode::OK);
    assert_eq!(body["routes"], json!([]));
}

#[tokio::test]
async fn the_switch_is_listed_with_the_network_settings_and_starts_on() {
    let t = test_app();

    let (_, view) = get(&t.app, "/api/admin/settings?view=network", Some(&t.token)).await;

    let row = view["groups"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|group| group["rows"].as_array().unwrap())
        .find(|row| row["key"] == json!("directConnections"))
        .expect("a directConnections row");
    assert_eq!(row["kind"], json!("toggle"));
    assert_eq!(row["value"], json!(true));
}

#[tokio::test]
async fn the_origin_seen_through_the_tunnel_may_read_the_lan_answers() {
    let t = test_app();
    let before = preflight(&t, "https://kroma.example").await;

    offer_through_the_tunnel(&t, HOUSEHOLD_PUBLIC_IP).await;
    let after = preflight(&t, "https://kroma.example").await;

    assert!(before.get("access-control-allow-origin").is_none());
    assert_eq!(
        after["access-control-allow-origin"],
        "https://kroma.example"
    );
    assert_eq!(after["access-control-max-age"], "7200");
}

#[tokio::test]
async fn an_origin_claimed_without_a_named_proxy_is_not_learned() {
    let t = test_app();

    get_from(
        &t.app,
        NEIGHBOUR,
        "/api/server/direct",
        Some(&t.token),
        &[("x-forwarded-proto", "https"), ("host", "evil.example")],
    )
    .await;
    let headers = preflight(&t, "https://evil.example").await;

    assert!(headers.get("access-control-allow-origin").is_none());
}

#[tokio::test]
async fn the_public_web_address_may_read_the_lan_answers() {
    let t = test_app_served_at(Some("https://kroma.example/"), None);

    let headers = preflight(&t, "https://kroma.example").await;

    assert_eq!(
        headers["access-control-allow-origin"],
        "https://kroma.example"
    );
}
