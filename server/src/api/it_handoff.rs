//! Integration tests for the nearby-handoff surface (`src/api/handoff.rs`): a
//! signed-out TV announcing itself, a signed-in phone listing it and granting
//! its account, and the refusals that keep the feature to one network. The
//! whole point is that reach, not a code, is what authorizes the handoff.
//!
//! The harness peers from loopback, so `x-forwarded-for` is how a test says
//! "this call came from somewhere else" (`client_ip` trusts the header only
//! behind a loopback peer, which is exactly the local-reverse-proxy case), and
//! `origin` is how it says "this call came from a page rather than a device".

use axum::http::{HeaderMap, StatusCode};
use serde_json::{json, Value};

use crate::api::test_support::{get, raw, send, test_app, TestApp};
use crate::services::pairing::handoff::{Announce, Announcement, MAX_ANNOUNCES_PER_MINUTE};

const TV_IP: &str = "192.168.1.20";
const PHONE_IP: &str = "192.168.1.50";
const OTHER_SUBNET: &str = "192.168.9.9";
// One household as a server on another network sees it: both devices leave
// through the same NAT, so both arrive wearing that one address.
const HOUSEHOLD: &str = "203.0.113.7";
const OTHER_HOUSEHOLD: &str = "203.0.113.9";

async fn from(
    t: &TestApp,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
    ip: &str,
) -> (StatusCode, Value) {
    let (status, _headers, value) =
        raw(&t.app, method, uri, token, body, &[("x-forwarded-for", ip)]).await;
    (status, value)
}

async fn announce(t: &TestApp, device_id: &str, name: &str, ip: &str) -> Value {
    let body = json!({ "deviceId": device_id, "name": name, "platform": "tvOS" });
    let (status, reply) = from(t, "POST", "/api/handoff/announce", None, Some(body), ip).await;
    assert_eq!(status, StatusCode::OK, "announce refused: {reply}");
    reply
}

// What a packaged Samsung or LG shell presents, byte for byte what a sandboxed
// iframe presents: admitted, and flagged so the grant asks for the check string
// off the television's own screen.
async fn announce_unplaceable(t: &TestApp, device_id: &str, ip: &str) -> Value {
    let body = json!({ "deviceId": device_id, "name": "Salon", "platform": "tizen" });
    let (status, _headers, reply) = raw(
        &t.app,
        "POST",
        "/api/handoff/announce",
        None,
        Some(body),
        &[("x-forwarded-for", ip), ("origin", "null")],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "a packaged shell was refused: {reply}");
    reply
}

async fn grant(t: &TestApp, body: Value, ip: &str) -> StatusCode {
    from(t, "POST", "/api/handoff/grant", Some(&t.token), Some(body), ip).await.0
}

fn secret(beacon: &Value) -> String {
    beacon["secret"].as_str().expect("a poll secret").to_string()
}

async fn poll(t: &TestApp, beacon: &Value) -> Value {
    // A POST with the secret in the body: a URL is written into every access
    // log the request passes through.
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/handoff/poll",
        None,
        Some(json!({ "secret": secret(beacon) })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    body
}

async fn poll_status(t: &TestApp, beacon: &Value) -> String {
    poll(t, beacon).await["status"].as_str().unwrap_or_default().to_string()
}

async fn session_count(t: &TestApp) -> usize {
    let (_, list) = get(&t.app, "/api/auth/me/sessions", Some(&t.token)).await;
    list.as_array().map(Vec::len).unwrap_or(0)
}

#[tokio::test]
async fn a_phone_signs_a_waiting_tv_in_by_picking_it_from_the_list() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    assert_eq!(beacon["check"].as_str().map(str::len), Some(5));
    assert_eq!(beacon["confirmRequired"], false, "a television sends no origin at all");
    assert!(beacon["pollSecs"].as_i64().unwrap_or(0) < beacon["ttlSecs"].as_i64().unwrap_or(0));
    assert_eq!(poll_status(&t, &beacon).await, "pending");

    let (status, list) =
        from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(1));
    assert_eq!(list[0]["name"], "Salon");
    assert_eq!(list[0]["platform"], "tvOS");
    // The two screens show the same check string, and the row carries nothing
    // about where the TV sits.
    assert_eq!(list[0]["check"], beacon["check"]);
    assert_eq!(list[0]["confirmRequired"], false);
    assert!(list[0].get("ip").is_none());

    // Placed, so the tap alone signs it in: no check string travels back.
    let status = grant(&t, json!({ "handle": list[0]["handle"] }), PHONE_IP).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let granted = poll(&t, &beacon).await;
    assert_eq!(granted["status"], "authorized");
    assert_eq!(granted["user"]["username"], "owner");

    // The TV's new session is an ordinary one: it works, and it is listed with
    // the account's other devices so it can be revoked like any other.
    let tv_token = granted["token"].as_str().expect("a session token");
    let (status, me) = get(&t.app, "/api/auth/me", Some(tv_token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["username"], "owner");

    // Collected exactly once: the beacon is gone from both the poll and the list.
    assert_eq!(poll_status(&t, &beacon).await, "expired");
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_server_on_another_network_still_pairs_a_tv_and_a_phone_in_one_room() {
    // The server is somewhere else entirely (a NAS at home reached over a
    // tunnel, say), so it never sees either device's own address: the TV and
    // the phone both arrive through their household's one public address.
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", HOUSEHOLD).await;

    let (status, list) =
        from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, HOUSEHOLD).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(1));

    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": list[0]["handle"] })),
        HOUSEHOLD,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn a_phone_that_heard_the_tv_grants_where_the_addresses_alone_would_not() {
    // A home routed across two subnets, or a dual-stack one where the TV came
    // over IPv6 and the phone over IPv4: same room, addresses this server
    // cannot reconcile. Quoting the proof from the TV's DNS-SD record settles
    // it, because a multicast does not leave the link it was sent on.
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let proof = beacon["proof"].as_str().expect("a link proof").to_string();
    assert_eq!(proof.len(), 32, "hex of 16 bytes");

    let refused = json!({ "handle": beacon["handle"] });
    let (status, _) =
        from(&t, "POST", "/api/handoff/grant", Some(&t.token), Some(refused), OTHER_SUBNET).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let heard = json!({ "handle": beacon["handle"], "proof": proof });
    let (status, _) =
        from(&t, "POST", "/api/handoff/grant", Some(&t.token), Some(heard), OTHER_SUBNET).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn a_proof_nobody_published_is_refused() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let before = session_count(&t).await;

    let invented = json!({ "handle": beacon["handle"], "proof": "0".repeat(32) });
    let (status, _) =
        from(&t, "POST", "/api/handoff/grant", Some(&t.token), Some(invented), OTHER_SUBNET).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(poll_status(&t, &beacon).await, "pending");
    assert_eq!(session_count(&t).await, before);
}

#[tokio::test]
async fn a_phone_leaving_through_another_router_is_shown_no_tvs_and_may_not_grant() {
    // Next door, or the same phone with wifi off: a different way onto the
    // internet, so not the same room however close it is.
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", HOUSEHOLD).await;
    let handle = beacon["handle"].clone();

    // Not an error a scanner could read: the same empty list as "nothing waiting".
    let (status, list) =
        from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, OTHER_HOUSEHOLD).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    let before = session_count(&t).await;
    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": handle })),
        OTHER_HOUSEHOLD,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(poll_status(&t, &beacon).await, "pending");
    assert_eq!(session_count(&t).await, before, "a refused grant minted a session");
}

#[tokio::test]
async fn a_handle_learned_elsewhere_is_useless_from_another_subnet() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;

    // Local enough to use the feature, but not on the TV's own link.
    let (status, list) =
        from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, OTHER_SUBNET).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    let before = session_count(&t).await;
    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": beacon["handle"] })),
        OTHER_SUBNET,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(poll_status(&t, &beacon).await, "pending");
    // The tokens minted for a grant that was then refused are cleaned up.
    assert_eq!(session_count(&t).await, before);
}

#[tokio::test]
async fn a_caller_cannot_claim_a_subnet_by_writing_it_into_the_forwarded_header() {
    // The shape a proxy produces is `what-the-caller-sent, the-peer-it-saw`, so
    // believing the left half is how a stranger claims to be in your house.
    let t = test_app();
    announce(&t, "tv-salon-01", "Salon", TV_IP).await;

    let (status, list) = from(
        &t,
        "GET",
        "/api/handoff/devices",
        Some(&t.token),
        None,
        // Claiming the television's own subnet, from somewhere else entirely.
        "192.168.1.50, 203.0.113.9",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(Vec::len), Some(0), "the claim was believed");
}

#[tokio::test]
async fn a_beacon_already_granted_is_neither_listed_nor_grantable_again() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let grant = json!({ "handle": beacon["handle"] });

    let (status, _) =
        from(&t, "POST", "/api/handoff/grant", Some(&t.token), Some(grant.clone()), PHONE_IP).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Gone from the list before the television has even collected it.
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    // And a second grant mints nothing: the first approver's session stands.
    let before = session_count(&t).await;
    let (status, _) =
        from(&t, "POST", "/api/handoff/grant", Some(&t.token), Some(grant), PHONE_IP).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(session_count(&t).await, before, "a refused second grant minted a session");

    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn a_network_already_holding_its_share_is_refused_rather_than_thinned() {
    let t = test_app();
    let first = announce(&t, "tv-0000-xxxx", "Salon", TV_IP).await;
    for i in 1..8 {
        announce(&t, &format!("tv-{i:04}-xxxx"), "Flood", TV_IP).await;
    }

    let body = json!({ "deviceId": "tv-late-xxxx", "name": "Late", "platform": "tvOS" });
    let (status, _) = from(&t, "POST", "/api/handoff/announce", None, Some(body), TV_IP).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    // Nobody was pushed out to make room.
    assert_eq!(poll_status(&t, &first).await, "pending");
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(8));
}

// Fills the store to its global bound through the service instead of the API,
// so that nothing drains what the last announce crowds out. That last one finds
// every network holding its full share, and the slot it takes is the
// least-recently-seen beacon of the fullest: the very first one announced.
fn crowd_the_store_out(t: &TestApp) {
    let fill = |device_id: String, ip: String| {
        let (announcement, _) = t.state.handoff.announce(Announce {
            device_id,
            name: "Flood".into(),
            platform: "tvOS".into(),
            ip,
            confirm_required: false,
        });
        assert!(matches!(announcement, Announcement::Ok(_)), "the store had room");
    };
    for tv in 1..8 {
        fill(format!("tv-000{tv}-xxxx"), format!("192.168.1.{}", 20 + tv));
    }
    for network in 1..32 {
        for tv in 0..8 {
            fill(format!("tv-{network:02}{tv:02}-xxxx"), format!("203.0.113.{network}"));
        }
    }
    fill("tv-last-xxxx".into(), "198.51.100.1".into());
}

#[tokio::test]
async fn the_rows_of_a_beacon_that_left_uncollected_go_with_the_next_listing() {
    // A beacon granted and never polled for holds a session and a 90-day access
    // token that nothing else in the server deletes. The store surrenders them
    // whenever it is next touched, and every route touches it: here the only
    // request after the beacon goes is a phone asking what is nearby.
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": beacon["handle"] })),
        PHONE_IP,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let granted = session_count(&t).await;

    crowd_the_store_out(&t);
    assert_eq!(session_count(&t).await, granted, "nothing has touched the store yet");

    let (status, _) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(session_count(&t).await, granted - 1, "the tokens outlived their beacon");
}

#[tokio::test]
async fn granting_a_handle_that_never_existed_is_refused() {
    let t = test_app();
    let before = session_count(&t).await;
    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": "deadbeef" })),
        PHONE_IP,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(session_count(&t).await, before);
}

#[tokio::test]
async fn a_device_id_that_is_not_a_device_id_is_refused() {
    let t = test_app();
    for bad in ["short", "../../etc/passwd", "tv salon 01"] {
        let body = json!({ "deviceId": bad, "name": "Salon" });
        let (status, _) = from(&t, "POST", "/api/handoff/announce", None, Some(body), TV_IP).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "accepted {bad}");
    }
}

#[tokio::test]
async fn a_beacon_lives_while_the_tv_polls_and_ends_when_it_leaves() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;

    // Polling is the liveness signal: still pending, still listed.
    assert_eq!(poll_status(&t, &beacon).await, "pending");
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(1));

    let body = json!({ "secret": secret(&beacon) });
    let (status, _) = send(&t.app, "POST", "/api/handoff/leave", None, Some(body)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(poll_status(&t, &beacon).await, "expired");

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_tv_re_announcing_replaces_its_own_row_rather_than_adding_one() {
    let t = test_app();
    let first = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let body = json!({
        "deviceId": "tv-salon-01",
        "name": "Salon",
        "platform": "tvOS",
        "prevSecret": secret(&first),
    });
    let (status, second) = from(&t, "POST", "/api/handoff/announce", None, Some(body), TV_IP).await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(second["handle"], first["handle"]);

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(1));
    assert_eq!(poll_status(&t, &first).await, "expired");
}

#[tokio::test]
async fn an_unknown_secret_polls_expired() {
    let t = test_app();
    let (status, body) =
        send(&t.app, "POST", "/api/handoff/poll", None, Some(json!({ "secret": "nope" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "expired");
    // Leaving with a secret nobody holds is a no-op, not an error.
    let (status, _) =
        send(&t.app, "POST", "/api/handoff/leave", None, Some(json!({ "secret": "nope" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn listing_and_granting_need_a_session() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;

    let (status, _) = from(&t, "GET", "/api/handoff/devices", None, None, PHONE_IP).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        None,
        Some(json!({ "handle": beacon["handle"] })),
        PHONE_IP,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// What a page on the web presents, and can only present. `null` is not here: a
// packaged Samsung or LG shell reports it too, so it announces and confirms
// instead of being refused (see `crate::api::origin`).
const A_PAGE: &[&str] = &["https://evil.example", "http://evil.example:8080"];
// What a client presents: a shell loaded off the device it runs on, or a dev
// server on this machine or this network.
const A_CLIENT: &[&str] =
    &["file://", "tauri://localhost", "http://localhost:5174", "http://192.168.1.20:5174"];

async fn announce_from_a_browser_at(t: &TestApp, device_id: &str, origin: &str) -> StatusCode {
    let body = json!({ "deviceId": device_id, "name": "Salon", "platform": "tvOS" });
    let (status, _headers, _body) = raw(
        &t.app,
        "POST",
        "/api/handoff/announce",
        None,
        Some(body),
        &[("x-forwarded-for", TV_IP), ("origin", origin)],
    )
    .await;
    status
}

async fn allowed_to_read(t: &TestApp, origin: &str) -> Option<String> {
    let (_status, headers, _body) =
        raw(&t.app, "GET", "/api/auth/config", None, None, &[("origin", origin)]).await;
    allow_origin(&headers)
}

async fn allowed_to_preflight_an_announce(t: &TestApp, origin: &str) -> Option<String> {
    let (_status, headers, _body) = raw(
        &t.app,
        "OPTIONS",
        "/api/handoff/announce",
        None,
        None,
        &[
            ("origin", origin),
            ("access-control-request-method", "POST"),
            ("access-control-request-headers", "content-type"),
        ],
    )
    .await;
    allow_origin(&headers)
}

fn allow_origin(headers: &HeaderMap) -> Option<String> {
    headers
        .get("access-control-allow-origin")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

#[tokio::test]
async fn a_page_on_the_web_cannot_raise_a_beacon_of_its_own() {
    // The whole approval is a tap, so a beacon a stranger's page raised on this
    // network is a row in every phone's list that anybody may hand an account.
    let t = test_app();
    for origin in A_PAGE {
        assert_eq!(
            announce_from_a_browser_at(&t, "tv-salon-01", origin).await,
            StatusCode::FORBIDDEN,
            "announced from {origin}"
        );
    }

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_shell_on_the_device_or_on_this_network_raises_one() {
    // One device id per origin: a television re-announcing replaces its own row.
    let t = test_app();
    for (n, origin) in A_CLIENT.iter().enumerate() {
        assert_eq!(
            announce_from_a_browser_at(&t, &format!("tv-shell-{n:02}"), origin).await,
            StatusCode::OK,
            "refused {origin}"
        );
    }

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(A_CLIENT.len()));
}

#[tokio::test]
async fn a_page_on_the_web_cannot_collect_a_grant_left_for_a_television() {
    // The television sends no origin at all, which is what a native client is.
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    let (status, _) = from(
        &t,
        "POST",
        "/api/handoff/grant",
        Some(&t.token),
        Some(json!({ "handle": beacon["handle"] })),
        PHONE_IP,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let body = json!({ "secret": secret(&beacon) });
    for route in ["/api/handoff/poll", "/api/handoff/leave"] {
        let (status, _, _) = raw(
            &t.app,
            "POST",
            route,
            None,
            Some(body.clone()),
            &[("origin", "https://evil.example")],
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{route} answered a page");
    }

    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn the_preflight_a_browser_sends_first_already_refuses_a_page() {
    // A JSON body is not a simple request, so this is the round trip that
    // decides whether the announce is ever sent.
    let t = test_app();
    assert_eq!(allowed_to_preflight_an_announce(&t, "https://evil.example").await, None);
    assert_eq!(
        allowed_to_preflight_an_announce(&t, "file://").await.as_deref(),
        Some("file://")
    );
}

#[tokio::test]
async fn a_page_on_the_web_may_ask_but_may_not_read() {
    let t = test_app();
    // A packaged television shell reports `null` and has nothing else to report,
    // so it reads its own answers even though it may not raise a beacon.
    for origin in ["null", "file://", "http://localhost:5174"] {
        assert_eq!(allowed_to_read(&t, origin).await.as_deref(), Some(origin), "refused {origin}");
    }
    assert_eq!(allowed_to_read(&t, "https://evil.example").await, None);
}

#[tokio::test]
async fn a_shell_nobody_can_place_announces_and_the_row_asks_for_its_check() {
    let t = test_app();
    let beacon = announce_unplaceable(&t, "tv-tizen-01", TV_IP).await;
    assert_eq!(beacon["confirmRequired"], true);
    assert_eq!(beacon["check"].as_str().map(str::len), Some(5));

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list[0]["confirmRequired"], true);
    assert_eq!(list[0]["check"], beacon["check"]);
}

#[tokio::test]
async fn granting_a_beacon_nobody_can_place_takes_the_check_off_the_television() {
    let t = test_app();
    let beacon = announce_unplaceable(&t, "tv-tizen-01", TV_IP).await;
    let handle = beacon["handle"].clone();
    let check = beacon["check"].as_str().expect("a check string").to_string();
    let before = session_count(&t).await;

    // A tap on its own is what a page raising this beacon would be counting on.
    let status = grant(&t, json!({ "handle": handle }), PHONE_IP).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let status = grant(&t, json!({ "handle": handle, "check": "  " }), PHONE_IP).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let status = grant(&t, json!({ "handle": handle, "check": "WRONG" }), PHONE_IP).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(poll_status(&t, &beacon).await, "pending");
    assert_eq!(session_count(&t).await, before, "a refused grant left a session behind");

    // As a person types it off a screen across the room.
    let typed = format!("  {}  ", check.to_lowercase());
    let status = grant(&t, json!({ "handle": handle, "check": typed }), PHONE_IP).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(poll_status(&t, &beacon).await, "authorized");
}

#[tokio::test]
async fn three_wrong_checks_burn_the_beacon_and_leave_nothing_behind() {
    let t = test_app();
    let beacon = announce_unplaceable(&t, "tv-tizen-01", TV_IP).await;
    let handle = beacon["handle"].clone();
    let check = beacon["check"].as_str().expect("a check string").to_string();
    let before = session_count(&t).await;

    let wrong = json!({ "handle": handle, "check": "WRONG" });
    assert_eq!(grant(&t, wrong.clone(), PHONE_IP).await, StatusCode::FORBIDDEN);
    assert_eq!(grant(&t, wrong.clone(), PHONE_IP).await, StatusCode::FORBIDDEN);
    assert_eq!(grant(&t, wrong.clone(), PHONE_IP).await, StatusCode::TOO_MANY_REQUESTS);

    // Gone: the right answer is worth no more than the wrong ones now.
    assert_eq!(grant(&t, wrong, PHONE_IP).await, StatusCode::NOT_FOUND);
    let right = json!({ "handle": handle, "check": check });
    assert_eq!(grant(&t, right, PHONE_IP).await, StatusCode::NOT_FOUND);

    assert_eq!(poll_status(&t, &beacon).await, "expired");
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));
    assert_eq!(session_count(&t).await, before, "the refused grants leaked a session");
}

#[tokio::test]
async fn an_address_announcing_far_past_any_television_cadence_is_refused() {
    // The same television re-announcing, so its beacon is replaced rather than
    // added and the per-network share is never what refuses.
    let t = test_app();
    let body = json!({ "deviceId": "tv-salon-01", "name": "Salon", "platform": "tvOS" });
    for attempt in 1..=MAX_ANNOUNCES_PER_MINUTE {
        let (status, _) =
            from(&t, "POST", "/api/handoff/announce", None, Some(body.clone()), TV_IP).await;
        assert_eq!(status, StatusCode::OK, "refused announce {attempt}");
    }

    let (status, _) = from(&t, "POST", "/api/handoff/announce", None, Some(body), TV_IP).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    // And the ceiling is one address's own: the phone next to it still lists the
    // beacon that is up, and another household is untouched.
    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    assert_eq!(list.as_array().map(Vec::len), Some(1));
    announce(&t, "tv-chambre-01", "Chambre", HOUSEHOLD).await;
}

#[tokio::test]
async fn two_waiting_tvs_are_listed_by_name() {
    let t = test_app();
    announce(&t, "tv-salon-01", "Salon", TV_IP).await;
    announce(&t, "tv-chambre-01", "Chambre", TV_IP).await;

    let (_, list) = from(&t, "GET", "/api/handoff/devices", Some(&t.token), None, PHONE_IP).await;
    let names: Vec<&str> =
        list.as_array().expect("a list").iter().filter_map(|r| r["name"].as_str()).collect();
    assert_eq!(names, vec!["Chambre", "Salon"]);
}

// The session is minted BEFORE the beacon is handed over, so the one failure
// that branch exists for has to leave the beacon standing: a television that is
// still waiting is recoverable, and one consumed against a session that was
// never created is a set that has to be restarted.
//
// Forced the only way a test can force it, by taking the table the mint writes
// into out from under the handler.
#[tokio::test]
async fn a_grant_that_cannot_mint_a_session_refuses_and_leaves_the_beacon_waiting() {
    let t = test_app();
    let beacon = announce(&t, "tv-salon-01", "Salon", TV_IP).await;

    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch("DROP TABLE access_tokens")
        .expect("drop the table the mint writes into");

    let status = grant(&t, json!({ "handle": beacon["handle"] }), PHONE_IP).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    // Still waiting, and still its own beacon: nothing was spent on the attempt.
    assert_eq!(poll_status(&t, &beacon).await, "pending");
}
