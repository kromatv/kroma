use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_session, send, test_app};
use crate::model::Permission;

fn beat(playback: Option<Value>, applied: u64) -> Value {
    let mut body = json!({
        "receiverId": "tv-salon-01",
        "name": "Salon",
        "platform": "Tizen",
        "lastAppliedSeq": applied,
    });
    if let Some(pb) = playback {
        body["playback"] = pb;
    }
    body
}

fn episode_two() -> Value {
    json!({
        "mount": "/api/module/tv.example.swarm",
        "id": "f13348a88094f2e1",
        "file": 1,
        "title": "Kaamelott",
        "tmdbId": 11466,
        "season": 1,
        "episode": 2,
    })
}

async fn announce(t: &crate::api::test_support::TestApp, token: &str, body: Value) -> Value {
    let (status, reply) = send(
        &t.app,
        "POST",
        "/api/cast/announce",
        Some(token),
        Some(body),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    reply
}

#[tokio::test]
async fn a_watch_download_is_relayed_to_the_television_as_it_was_named() {
    let t = test_app();
    announce(&t, &t.token, beat(None, 0)).await;

    let (status, sent) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "watch", "watch": episode_two(), "positionMs": 30_000 })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(sent["seq"], 1);
    let reply = announce(&t, &t.token, beat(None, 0)).await;
    let command = &reply["commands"][0]["command"];
    assert_eq!(command["type"], "watch");
    assert_eq!(command["watch"], episode_two());
    assert_eq!(command["positionMs"], 30_000);
}

#[tokio::test]
async fn the_remote_sees_the_watch_download_the_television_reports() {
    let t = test_app();
    let playing = json!({
        "watch": episode_two(),
        "positionMs": 31_000,
        "durationMs": 70_000,
        "state": "playing",
    });

    announce(&t, &t.token, beat(Some(playing), 0)).await;

    let (_, list) = get(&t.app, "/api/cast/receivers", Some(&t.token)).await;
    let now = &list[0]["nowWatching"];
    assert_eq!(now["watch"], episode_two());
    assert_eq!(now["positionMs"], 31_000);
    assert_eq!(now["durationMs"], 70_000);
    assert!(list[0].get("nowPlaying").is_none());
}

#[tokio::test]
async fn a_watch_download_outside_the_shape_the_core_holds_is_not_relayed() {
    let t = test_app();
    announce(&t, &t.token, beat(None, 0)).await;
    let mut watch = episode_two();
    watch["id"] = json!("../../admin");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&t.token),
        Some(json!({ "type": "watch", "watch": watch })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    let reply = announce(&t, &t.token, beat(None, 0)).await;
    assert_eq!(reply["commands"].as_array().map(Vec::len), Some(0));
}

#[tokio::test]
async fn a_remote_that_may_not_watch_downloads_cannot_cast_one() {
    let t = test_app();
    let (_, member) = seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );
    announce(&t, &member, beat(None, 0)).await;

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/cast/receivers/tv-salon-01/command",
        Some(&member),
        Some(json!({ "type": "watch", "watch": episode_two() })),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}
