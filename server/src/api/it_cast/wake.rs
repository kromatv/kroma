//! Integration tests for bringing a television back (`src/api/cast/wake.rs`):
//! what it said is kept after it leaves, it is listed asleep, and waking it
//! hands the caller the steps and holds the play. The server runs no step.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

use crate::api::test_support::{demo_item_id, get, seed_session, send, send_from, test_app};
use crate::model::Permission;

const ELSEWHERE: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(203, 0, 113, 9)), 51000);
const TV: &str = "tv-salon-01";

fn beat(wake: Option<Value>) -> Value {
    let mut body = json!({
        "receiverId": TV,
        "name": "Salon",
        "platform": "Tizen",
        "lastAppliedSeq": 0,
    });
    if let Some(wake) = wake {
        body["wake"] = wake;
    }
    body
}

fn hint() -> Value {
    json!({ "mac": "A0-B1-C2-D3-E4-F5", "address": "192.168.1.20", "appId": "KromaTV001.Kroma" })
}

async fn announce(app: &Router, token: &str, wake: Option<Value>) -> Value {
    let (status, reply) = send_from(
        app,
        ELSEWHERE,
        ("POST", "/api/cast/announce"),
        Some(token),
        Some(beat(wake)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    reply
}

async fn leave(app: &Router, token: &str) {
    send(
        app,
        "DELETE",
        &format!("/api/cast/receivers/{TV}"),
        Some(token),
        None,
    )
    .await;
}

async fn roster(app: &Router, token: &str) -> Vec<Value> {
    let (_, list) = get(app, "/api/cast/receivers", Some(token)).await;
    list.as_array().cloned().unwrap_or_default()
}

// The hint is stored off the request, so the roster is read until it shows.
async fn roster_once(app: &Router, token: &str, wanted: usize) -> Vec<Value> {
    for _ in 0..200 {
        let list = roster(app, token).await;
        if list.len() == wanted {
            return list;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    roster(app, token).await
}

async fn wake(app: &Router, token: &str, body: Option<Value>) -> (StatusCode, Value) {
    send(
        app,
        "POST",
        &format!("/api/cast/receivers/{TV}/wake"),
        Some(token),
        body,
    )
    .await
}

async fn asleep_television(app: &Router, token: &str) {
    announce(app, token, Some(hint())).await;
    roster_once(app, token, 1).await;
    leave(app, token).await;
    let list = roster_once(app, token, 1).await;
    assert_eq!(list[0]["asleep"], true);
}

#[tokio::test]
async fn a_television_that_left_is_listed_asleep_and_waking_it_gives_the_steps() {
    let t = test_app();
    asleep_television(&t.app, &t.token).await;

    let (status, reply) = wake(&t.app, &t.token, None).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        reply["steps"],
        json!([{
            "type": "samsung",
            "address": "192.168.1.20",
            "mac": "a0:b1:c2:d3:e4:f5",
            "appId": "KromaTV001.Kroma",
        }])
    );
    let list = roster(&t.app, &t.token).await;
    assert_eq!(list[0]["name"], "Salon");
    assert_eq!(list[0]["network"], "WAN");
    assert!(list[0].get("mac").is_none());
    assert!(list[0].get("address").is_none());
}

#[tokio::test]
async fn the_play_sent_with_the_wake_is_handed_over_when_the_television_arrives() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    asleep_television(&t.app, &t.token).await;

    let play = json!({ "play": { "type": "play", "itemId": item, "positionMs": 60_000 } });
    let (status, _) = wake(&t.app, &t.token, Some(play)).await;
    let reply = announce(&t.app, &t.token, Some(hint())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(reply["commands"][0]["seq"], 1);
    assert_eq!(reply["commands"][0]["command"]["type"], "play");
    assert_eq!(reply["commands"][0]["command"]["itemId"], item);
    assert_eq!(reply["commands"][0]["command"]["positionMs"], 60_000);
    let list = roster(&t.app, &t.token).await;
    assert_eq!(list.len(), 1);
    assert!(list[0].get("asleep").is_none());
}

#[tokio::test]
async fn waking_a_television_that_is_there_hands_the_play_over_at_once() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    announce(&t.app, &t.token, Some(hint())).await;

    let play = json!({ "play": { "type": "play", "itemId": item } });
    let (status, reply) = wake(&t.app, &t.token, Some(play)).await;
    let beat = announce(&t.app, &t.token, Some(hint())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(reply, json!({ "steps": [] }));
    assert_eq!(beat["commands"][0]["command"]["itemId"], item);
}

#[tokio::test]
async fn only_a_play_is_held_and_only_for_a_title_the_caller_can_see() {
    let t = test_app();
    asleep_television(&t.app, &t.token).await;

    let unknown = json!({ "play": { "type": "play", "itemId": "no-such-title" } });
    let (status, _) = wake(&t.app, &t.token, Some(unknown)).await;
    let (paused, _) = wake(&t.app, &t.token, Some(json!({ "play": { "type": "pause" } }))).await;
    let reply = announce(&t.app, &t.token, Some(hint())).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(paused, StatusCode::OK);
    assert_eq!(reply["commands"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn another_account_neither_sees_wakes_nor_forgets_it() {
    let t = test_app();
    let (_, bob) = seed_session(&t.state, "bob@test.dev", "bob", &[Permission::Playback]);
    asleep_television(&t.app, &t.token).await;

    let seen = roster(&t.app, &bob).await;
    let (status, _) = wake(&t.app, &bob, None).await;
    let (forgot, _) = send(
        &t.app,
        "DELETE",
        &format!("/api/cast/receivers/{TV}/wake"),
        Some(&bob),
        None,
    )
    .await;

    assert!(seen.is_empty());
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(forgot, StatusCode::NO_CONTENT);
    assert_eq!(roster(&t.app, &t.token).await.len(), 1);
}

#[tokio::test]
async fn a_forgotten_television_is_no_longer_listed_or_woken() {
    let t = test_app();
    asleep_television(&t.app, &t.token).await;

    let (status, _) = send(
        &t.app,
        "DELETE",
        &format!("/api/cast/receivers/{TV}/wake"),
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(roster(&t.app, &t.token).await.is_empty());
    assert_eq!(
        wake(&t.app, &t.token, None).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn a_television_that_now_says_nothing_is_dropped_and_an_older_build_is_left_alone() {
    let t = test_app();
    asleep_television(&t.app, &t.token).await;

    announce(&t.app, &t.token, None).await;
    leave(&t.app, &t.token).await;
    let kept = roster_once(&t.app, &t.token, 1).await;
    announce(&t.app, &t.token, Some(json!({}))).await;
    leave(&t.app, &t.token).await;
    let dropped = roster_once(&t.app, &t.token, 0).await;

    assert_eq!(kept.len(), 1);
    assert!(dropped.is_empty());
}

#[tokio::test]
async fn waking_needs_the_playback_capability_and_a_well_formed_id() {
    let t = test_app();
    let (_, guest) = seed_session(&t.state, "guest@test.dev", "guest", &[]);

    let (refused, _) = wake(&t.app, &guest, None).await;
    let (malformed, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/short/wake",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(refused, StatusCode::FORBIDDEN);
    assert_eq!(malformed, StatusCode::BAD_REQUEST);
}
