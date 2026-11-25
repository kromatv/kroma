//! Integration tests for reading a screen over its event socket: a device says
//! hello on `GET /api/events`, an admin lists it at
//! `/api/admin/diagnostics/screens` and asks it what it shows, and the answer
//! comes back up the same socket.

use std::time::Duration;

use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_session, send, serve, test_app, EventSocket, TestApp};
use crate::model::Permission;

const SALON: &str = "tv-salon-01";
const ROSTER: &str = "/api/admin/diagnostics/screens";

fn hello(id: &str) -> Value {
    json!({ "type": "screen.hello", "screenId": id, "name": "Salon", "platform": "Tizen" })
}

fn screen() -> Value {
    json!({
        "fibers": 42,
        "truncated": false,
        "rows": [
            {
                "depth": 0,
                "name": "Dialog.Root",
                "props": { "open": true, "title": "Réglages", "size": 2.5, "icon": null },
                "box": { "x": 0.5, "y": 8.0, "width": 1920.0, "height": 1080.0 },
            },
            { "depth": 1, "name": "Dialog.Footer", "props": {}, "box": null },
        ],
    })
}

fn reply(request: &Value, screen: Value) -> Value {
    json!({ "type": "screen.reply", "requestId": request["requestId"], "screen": screen })
}

fn ask(app: &Router, token: &str, id: &str) -> tokio::task::JoinHandle<(StatusCode, Value)> {
    let (app, token, uri) = (app.clone(), token.to_string(), format!("{ROSTER}/{id}"));
    tokio::spawn(async move { send(&app, "POST", &uri, Some(&token), None).await })
}

async fn roster(t: &TestApp, token: &str) -> Vec<String> {
    let (status, body) = get(&t.app, ROSTER, Some(token)).await;
    assert_eq!(status, StatusCode::OK);
    body["screens"]
        .as_array()
        .expect("screens")
        .iter()
        .map(|s| s["id"].as_str().unwrap_or_default().to_string())
        .collect()
}

async fn roster_becomes(t: &TestApp, token: &str, want: &[&str]) {
    for _ in 0..200 {
        let mut ids = roster(t, token).await;
        ids.sort();
        if ids == want {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!(
        "the roster never became {want:?}: {:?}",
        roster(t, token).await
    );
}

async fn listed(t: &TestApp, id: &str) -> EventSocket {
    let addr = serve(t).await;
    let mut socket = EventSocket::open(addr, &t.token).await;
    socket.say_json(&hello(id)).await;
    roster_becomes(t, &t.token, &[id]).await;
    socket
}

#[tokio::test]
async fn a_screen_that_says_hello_is_on_its_accounts_roster() {
    let t = test_app();

    let _socket = listed(&t, SALON).await;

    let (_, body) = get(&t.app, ROSTER, Some(&t.token)).await;
    assert_eq!(
        body["screens"],
        json!([{ "id": SALON, "name": "Salon", "platform": "Tizen" }])
    );
}

#[tokio::test]
async fn an_admin_reads_the_rows_the_screen_answers_with() {
    let t = test_app();
    let mut socket = listed(&t, SALON).await;

    let call = ask(&t.app, &t.token, SALON);
    let request = socket.next_of("screen.request").await;
    socket.say_json(&reply(&request, screen())).await;
    let (status, body) = call.await.expect("the call");

    assert_eq!(request["screenId"], SALON);
    assert_eq!(request["requestId"].as_str().map(str::len), Some(64));
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, screen());
}

#[tokio::test]
async fn another_account_neither_lists_nor_reaches_the_screen() {
    let t = test_app();
    let _socket = listed(&t, SALON).await;
    let (_, other) = seed_session(&t.state, "other@test.dev", "other", &Permission::all());

    let listed = roster(&t, &other).await;
    let (status, _) = ask(&t.app, &other, SALON).await.expect("the call");
    let (missing, _) = ask(&t.app, &other, "tv-nowhere-1").await.expect("the call");

    assert!(listed.is_empty());
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(missing, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn an_account_without_an_admin_capability_is_refused() {
    let t = test_app();
    let (_, member) = seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );
    let addr = serve(&t).await;
    let mut socket = EventSocket::open(addr, &member).await;
    socket.say_json(&hello(SALON)).await;

    let (list, _) = get(&t.app, ROSTER, Some(&member)).await;
    let (read, _) = ask(&t.app, &member, SALON).await.expect("the call");

    assert_eq!(list, StatusCode::FORBIDDEN);
    assert_eq!(read, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_silent_screen_times_out_and_open_requests_are_bounded() {
    let t = test_app();
    let mut socket = listed(&t, SALON).await;
    let waiting: Vec<_> = (0..4).map(|_| ask(&t.app, &t.token, SALON)).collect();
    for _ in 0..4 {
        socket.next_of("screen.request").await;
    }

    let (busy, _) = ask(&t.app, &t.token, SALON).await.expect("the call");
    let mut timed_out = Vec::new();
    for call in waiting {
        timed_out.push(call.await.expect("the call").0);
    }
    let after = ask(&t.app, &t.token, SALON);
    let request = socket.next_of("screen.request").await;
    socket.say_json(&reply(&request, screen())).await;

    assert_eq!(busy, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(timed_out, vec![StatusCode::GATEWAY_TIMEOUT; 4]);
    assert_eq!(after.await.expect("the call").0, StatusCode::OK);
}

#[tokio::test]
async fn a_reply_from_another_connection_is_ignored() {
    let t = test_app();
    let mut socket = listed(&t, SALON).await;
    let mut impostor = EventSocket::open(serve(&t).await, &t.token).await;
    let forged = json!({ "fibers": 1, "truncated": false, "rows": [] });

    let call = ask(&t.app, &t.token, SALON);
    let request = socket.next_of("screen.request").await;
    let overheard = impostor.next_of("screen.request").await;
    impostor.say_json(&reply(&overheard, forged)).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    socket.say_json(&reply(&request, screen())).await;
    let (status, body) = call.await.expect("the call");

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, screen());
}

#[tokio::test]
async fn an_oversized_message_is_dropped_and_the_socket_stays_open() {
    let t = test_app();
    let mut socket = listed(&t, SALON).await;
    let row = json!({ "depth": 0, "name": "Text", "props": { "children": "x".repeat(500) }, "box": null });
    let oversized = json!({ "fibers": 2000, "truncated": false, "rows": vec![row; 2000] });

    let call = ask(&t.app, &t.token, SALON);
    let request = socket.next_of("screen.request").await;
    let message = reply(&request, oversized);
    socket.say_json(&message).await;
    socket.say_json(&reply(&request, screen())).await;
    let (status, body) = call.await.expect("the call");

    assert!(message.to_string().len() > 1 << 20);
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, screen());
}

#[tokio::test]
async fn a_screen_leaves_the_roster_when_its_socket_closes() {
    let t = test_app();
    let socket = listed(&t, SALON).await;

    drop(socket);

    roster_becomes(&t, &t.token, &[]).await;
}
