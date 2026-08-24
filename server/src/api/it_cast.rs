//! Integration tests for the cast surface (`src/api/cast.rs`): a receiver
//! announcing itself, a sender listing + driving it, and the refusals that keep
//! the feature honest (no capability, no such receiver, someone else's TV, an
//! item that doesn't exist).

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{demo_item_id, get, seed_session, send, test_app};
use crate::model::Permission;

fn beat(id: &str, playback: Option<serde_json::Value>) -> serde_json::Value {
    let mut body = json!({
        "receiverId": id,
        "name": "Salon",
        "platform": "Apple TV",
        "lastAppliedSeq": 0,
    });
    if let Some(pb) = playback {
        body["playback"] = pb;
    }
    body
}

#[tokio::test]
async fn a_receiver_announces_and_a_sender_drives_it() {
    let t = test_app();
    let item = demo_item_id("The Matrix");

    let (status, reply) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reply["commands"].as_array().map(Vec::len), Some(0));
    assert!(reply["ttlSecs"].as_u64().unwrap_or(0) >= 30);

    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(1));
    assert_eq!(list[0]["name"], "Salon");
    assert_eq!(list[0]["username"], "owner");
    assert!(list[0]["nowPlaying"].is_null());
    // The roster carries nothing privileged - no address, no account id, and no
    // per-reader flag (everything a caller is shown is its own).
    assert!(list[0].get("ip").is_none());
    assert!(list[0].get("userId").is_none());
    assert!(list[0].get("mine").is_none());

    let (status, sent) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "play", "itemId": item, "positionMs": 60_000 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(sent["seq"], 1);

    // The TV collects it on its next beat, and reports it is now playing.
    let (_, reply) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    let commands = reply["commands"].as_array().expect("commands");
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["seq"], 1);
    assert_eq!(commands[0]["command"]["type"], "play");
    assert_eq!(commands[0]["command"]["positionMs"], 60_000);

    let playing = json!({ "itemId": item, "positionMs": 60_000, "durationMs": 8_160_000, "state": "playing" });
    let mut acked = beat("tv-salon-01", Some(playing));
    acked["lastAppliedSeq"] = json!(1);
    let (_, reply) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(acked),
    )
    .await;
    // Acked → the inbox is empty; nothing is replayed a second time.
    assert_eq!(reply["commands"].as_array().map(Vec::len), Some(0));

    // ...and the sender now sees the title, resolved server-side.
    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    assert_eq!(list[0]["nowPlaying"]["item"]["title"], "The Matrix");
    assert_eq!(list[0]["nowPlaying"]["state"], "playing");
    assert_eq!(list[0]["nowPlaying"]["positionMs"], 60_000);
}

#[tokio::test]
async fn a_receiver_leaves_the_roster_when_it_says_so() {
    let t = test_app();
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;

    let (status, _) = send(
        &t.app,
        "DELETE",
        "/api/cast/receivers/tv-salon-01",
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    // Unregistering what is already gone is a no-op, not an error - it must not
    // become a way to probe which receiver ids exist.
    let (status, _) = send(
        &t.app,
        "DELETE",
        "/api/cast/receivers/tv-salon-01",
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn another_account_cannot_see_take_over_or_drive_a_receiver() {
    let t = test_app();
    let (_, bob) = seed_session(&t.state, "bob@test.dev", "bob", &[Permission::Playback]);
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;

    // Bob claiming the owner's receiver id is refused: otherwise he'd collect the
    // commands meant for that TV.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&bob),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Nor can he evict it.
    let (status, _) = send(
        &t.app,
        "DELETE",
        "/api/cast/receivers/tv-salon-01",
        Some(&bob),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(1));

    // He cannot even see it: casting is scoped to the account a receiver is
    // signed into, so a stranger's session on the same server offers nothing.
    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&bob)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(0));

    // And driving it answers exactly like a receiver that does not exist, so the
    // roster cannot be probed by id.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&bob),
        Some(json!({ "type": "pause" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // The owner still drives it.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "pause" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn casting_needs_the_playback_capability() {
    let t = test_app();
    // An account with no capabilities at all (invited, not yet allowed to watch).
    let (_, nobody) = seed_session(&t.state, "nobody@test.dev", "nobody", &[]);

    for (method, uri, body) in [
        (
            "POST",
            "/api/cast/announce",
            Some(beat("tv-salon-01", None)),
        ),
        ("GET", "/api/cast/receivers", None),
        (
            "POST",
            "/api/cast/receivers/tv-salon-01/command",
            Some(json!({ "type": "pause" })),
        ),
        ("DELETE", "/api/cast/receivers/tv-salon-01", None),
    ] {
        let (status, _) = send(&t.app, method, uri, Some(&nobody), body).await;
        assert_eq!(
            status,
            StatusCode::FORBIDDEN,
            "{method} {uri} must require playback"
        );
    }
}

#[tokio::test]
async fn the_cast_surface_is_closed_to_strangers() {
    let t = test_app();
    for (method, uri) in [
        ("POST", "/api/cast/announce"),
        ("GET", "/api/cast/receivers"),
        ("POST", "/api/cast/receivers/tv-salon-01/command"),
    ] {
        let (status, _) = send(&t.app, method, uri, None, Some(json!({}))).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "{method} {uri} must require a session"
        );
    }
}

#[tokio::test]
async fn commands_are_refused_for_a_missing_receiver_or_title() {
    let t = test_app();
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-ghost-99/command",
        Some(&t.token),
        Some(json!({ "type": "pause" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A live receiver, but a title that isn't in the catalog: the TV is never
    // handed an id the server didn't recognize.
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "play", "itemId": "no-such-item" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn malformed_receiver_ids_and_bodies_are_rejected() {
    let t = test_app();
    // Too short, and shapes that have no business being a map key.
    for id in ["short", "tv salon 01", "../../etc/passwd"] {
        let (status, _) = send(
            &t.app,
            "POST",
            "/api/cast/announce",
            Some(&t.token),
            Some(beat(id, None)),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "receiver id {id:?} must be refused"
        );
    }
    // An unknown command type is a 422 from the deserializer, never a queued
    // order the TV would have to interpret.
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "selfDestruct" })),
    )
    .await;
    assert!(
        status.is_client_error(),
        "unknown command types are refused, got {status}"
    );
}

fn frames_for(
    rx: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
    viewer: &str,
) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    while let Ok(envelope) = rx.try_recv() {
        if let Some(json) = envelope.payload_for(viewer) {
            out.push(serde_json::from_str(json).expect("event is json"));
        }
    }
    out
}

#[tokio::test]
async fn a_beat_that_only_moved_the_playhead_announces_a_position_not_a_whole_receiver() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    let playing = |ms: i64| json!({ "itemId": item, "positionMs": ms, "durationMs": 8_160_000, "state": "playing" });
    let mut rx = t.state.events.subscribe();

    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", Some(playing(1_000)))),
    )
    .await;
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", Some(playing(65_000)))),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let frames = frames_for(&mut rx, &t.user_id);
    let types: Vec<&str> = frames.iter().map(|f| f["type"].as_str().unwrap()).collect();
    assert_eq!(types, ["cast.receiver", "cast.position"]);
    let position = &frames[1];
    assert_eq!(position["receiverId"], json!("tv-salon-01"));
    assert_eq!(position["positionMs"], json!(65_000));
    assert_eq!(position["durationMs"], json!(8_160_000));
    assert_eq!(position["state"], json!("playing"));
}

#[tokio::test]
async fn a_paused_beat_still_reports_where_the_playhead_stopped() {
    let t = test_app();
    let item = demo_item_id("The Matrix");
    let paused = |ms: i64| json!({ "itemId": item, "positionMs": ms, "state": "paused" });
    let mut rx = t.state.events.subscribe();

    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", Some(paused(10)))),
    )
    .await;
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", Some(paused(20)))),
    )
    .await;

    let frames = frames_for(&mut rx, &t.user_id);
    assert_eq!(frames[1]["type"], json!("cast.position"));
    assert_eq!(frames[1]["state"], json!("paused"));
    assert!(frames[1].get("durationMs").is_none());
}

#[tokio::test]
async fn a_full_roster_refuses_the_next_television_instead_of_evicting_one() {
    let t = test_app();
    for n in 0..32 {
        let (status, _) = send(
            &t.app,
            "POST",
            "/api/cast/announce",
            Some(&t.token),
            Some(beat(&format!("tv-salon-{n:03}"), None)),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "receiver {n} should fit");
    }

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-one-too-many", None)),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);

    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    assert_eq!(list.as_array().map(Vec::len), Some(32));
}

#[tokio::test]
async fn a_command_addressed_to_a_malformed_receiver_id_never_reaches_the_roster() {
    let t = test_app();
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/short/command",
        Some(&t.token),
        Some(json!({ "type": "pause" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_remote_the_television_kicked_is_refused_rather_than_obeyed() {
    let t = test_app();
    send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(&t.token),
        Some(beat("tv-salon-01", None)),
    )
    .await;
    t.state
        .cast
        .attach_controller(
            "tv-salon-01",
            "sock-a",
            "Téléphone",
            &t.user_id,
            "owner",
            None,
        )
        .expect("attach the remote");
    t.state
        .cast
        .kick_controller("tv-salon-01", "sock-a")
        .expect("kick it off");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "pause" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
