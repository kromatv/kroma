use axum::http::StatusCode;
use serde_json::json;

use super::*;

async fn call(path: &str, body: Value) -> (StatusCode, Value) {
    let host = kroma_module_sdk::host::testing::StubHost::new();
    let app = routes::<kroma_module_sdk::host::testing::StubHost>().with_state(host);
    let req = axum::http::Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let resp = tower::ServiceExt::oneshot(app, req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn client(url: &str) -> Value {
    json!({ "url": url, "settings": { "apiKey": "key" } })
}

fn unreachable_client() -> Value {
    client("http://127.0.0.1:1")
}

#[tokio::test]
async fn caps_say_usenet_and_nothing_else() {
    let (status, answer) = call(
        "/_port/tv.kroma.torrents/client/caps",
        json!({ "client": unreachable_client(), "args": {} }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(answer, json!({ "Ok": { "protocols": ["usenet"] } }));
}

#[tokio::test]
async fn reannounce_is_a_no_op() {
    let (_, answer) = call(
        "/_port/tv.kroma.torrents/client/reannounce",
        json!({ "client": unreachable_client(), "args": { "client_ref": "n" } }),
    )
    .await;

    assert_eq!(answer, json!({ "Ok": null }));
}

#[tokio::test]
async fn every_method_is_mounted_where_the_consumer_calls_it() {
    for method in ["test", "add", "pause", "resume", "remove"] {
        let (status, answer) = call(
            &format!("/_port/tv.kroma.torrents/client/{method}"),
            json!({
                "client": unreachable_client(),
                "args": { "protocol": "usenet", "client_ref": "n", "magnet_or_url": "http://idx/a.nzb" },
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK, "{method}");
        assert!(answer["Err"].is_string(), "{method} lost its reason: {answer}");
    }
}

#[tokio::test]
async fn a_daemon_that_cannot_be_reached_is_a_failed_poll_not_a_forgotten_job() {
    let (status, _) = call(
        "/_port/tv.kroma.torrents/client/status",
        json!({ "client": unreachable_client(), "args": { "client_ref": "n" } }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn a_body_with_no_client_at_all_is_rejected_by_the_extractor() {
    let (status, _) = call("/_port/tv.kroma.torrents/client/test", json!({})).await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn an_add_with_no_protocol_is_refused_as_a_torrent() {
    let (_, answer) = call(
        "/_port/tv.kroma.torrents/client/add",
        json!({
            "client": unreachable_client(),
            "args": { "magnet_or_url": "magnet:?xt=urn:btih:AB", "label": "kroma" },
        }),
    )
    .await;

    assert_eq!(
        answer,
        json!({ "Err": "SABnzbd downloads usenet releases only, this one is torrent" })
    );
}

#[test]
fn a_call_reads_the_key_out_of_the_settings() {
    let call: Call = serde_json::from_value(json!({
        "client": {
            "kind": "sabnzbd", "url": "http://nas:8080", "username": "", "password": "",
            "settings": { "apiKey": "abc" },
        },
        "args": { "client_ref": "n", "download_dir": "/ignored" },
    }))
    .unwrap();

    assert_eq!(call.client.url, "http://nas:8080");
    assert_eq!(call.args.client_ref, "n");
    assert_eq!(api_key(&call.client), "abc");
}

#[test]
fn a_call_with_no_settings_has_no_key() {
    let call: Call =
        serde_json::from_value(json!({ "client": { "url": "http://nas:8080" } })).unwrap();

    assert_eq!(api_key(&call.client), "");
}

#[test]
fn a_status_answers_the_keys_the_consumer_reads() {
    let json = serde_json::to_value(wire(JobStatus {
        client_ref: "n".into(),
        name: "The.Film".into(),
        progress: 0.5,
        state: crate::JobState::Processing,
        down_bps: 7,
        size_bytes: 5,
        save_path: Some("/complete/The.Film".into()),
        error: None,
        downloaded_bytes: 3,
    }))
    .unwrap();

    assert_eq!(
        json,
        json!({
            "client_ref": "n",
            "name": "The.Film",
            "info_hash": null,
            "progress": 0.5,
            "state": "processing",
            "down_bps": 7,
            "up_bps": 0,
            "peers": 0,
            "peers_seen": 0,
            "size_bytes": 5,
            "save_path": "/complete/The.Film",
            "files": [],
            "error": null,
            "lifetime_downloaded_bytes": 3,
            "lifetime_uploaded_bytes": 0,
        })
    );
}

#[cfg(not(target_family = "wasm"))]
mod served {
    use super::*;
    use crate::fake::FakeSabnzbd;

    #[tokio::test]
    async fn a_completed_job_crosses_with_its_folder() {
        let s = FakeSabnzbd::start(|t| {
            if t.contains("mode=history") {
                r#"{"history":{"slots":[{"nzo_id":"n","status":"Completed","name":"A","storage":"/c/A","bytes":10}]}}"#.into()
            } else {
                r#"{"queue":{"slots":[]}}"#.into()
            }
        });

        let (_, answer) = call(
            "/_port/tv.kroma.torrents/client/status",
            json!({ "client": client(&s.base), "args": { "client_ref": "n" } }),
        )
        .await;

        assert_eq!(answer["state"], "completed");
        assert_eq!(answer["progress"], 1.0);
        assert_eq!(answer["save_path"], "/c/A");
    }

    #[tokio::test]
    async fn an_add_answers_the_nzo_id() {
        let s = FakeSabnzbd::start(|_| r#"{"status":true,"nzo_ids":["SABnzbd_nzo_a"]}"#.into());

        let (_, answer) = call(
            "/_port/tv.kroma.torrents/client/add",
            json!({
                "client": client(&s.base),
                "args": { "protocol": "usenet", "magnet_or_url": "http://idx/a.nzb", "name": "A", "label": "kroma" },
            }),
        )
        .await;

        assert_eq!(answer, json!({ "Ok": "SABnzbd_nzo_a" }));
    }
}
