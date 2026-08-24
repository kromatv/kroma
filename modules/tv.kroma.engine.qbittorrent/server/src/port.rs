//! The `download-client` point this module answers, under the instance
//! `qbittorrent`.
//!
//! The download module defines the point and resolves it by instance, so this
//! module links nothing of it: it declares the kind in its `module.json`, parses
//! the JSON below with structs of its own, and drives a qBittorrent WebUI.
//!
//! Every method carries the client it is for. This process is stateless about
//! which of the operator's configured clients it is serving: an operator may have
//! two qBittorrent instances, and the credentials belong to the row, not here.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{port_reply, HostCtx};

use crate::{cookie_jar_path, QBittorrent, KIND};

/// The routes this module mounts. `KIND` is the instance the download module
/// resolves it under.
pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/client/test", post(test::<S>))
        .route("/_port/tv.kroma.torrents/client/add", post(add::<S>))
        .route("/_port/tv.kroma.torrents/client/status", post(status::<S>))
        .route("/_port/tv.kroma.torrents/client/pause", post(pause::<S>))
        .route("/_port/tv.kroma.torrents/client/resume", post(resume::<S>))
        .route(
            "/_port/tv.kroma.torrents/client/reannounce",
            post(reannounce::<S>),
        )
        .route("/_port/tv.kroma.torrents/client/remove", post(remove::<S>))
}

/// The configured client a call is for. Tolerant: the consumer is separately
/// released, so a field it adds is ignored and one it omits defaults.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct Client {
    url: String,
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct Call {
    client: Client,
    #[serde(default)]
    args: Args,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Args {
    magnet_or_url: String,
    download_dir: Option<String>,
    label: String,
    client_ref: String,
    delete_data: bool,
}

/// A torrent as this engine reports it. The keys are what the consumer reads; a
/// rename here breaks it in another process, so `a_status_answers_the_keys_the_consumer_reads`
/// pins them.
#[derive(Debug, Clone, Serialize)]
struct Status {
    client_ref: String,
    name: String,
    info_hash: Option<String>,
    progress: f64,
    state: String,
    down_bps: u64,
    up_bps: u64,
    peers: u32,
    peers_seen: u32,
    size_bytes: u64,
    save_path: Option<String>,
    files: Vec<String>,
    error: Option<String>,
}

fn engine<S: HostCtx>(host: &S, client: &Client) -> QBittorrent {
    let def = crate::ClientDef {
        kind: KIND.to_string(),
        url: client.url.clone(),
        username: client.username.clone(),
        password: client.password.clone(),
    };
    let jar = cookie_jar_path(&host.data_dir().join("qbittorrent"), &def);
    QBittorrent::new(&def, jar)
}

async fn test<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<String, String>> {
    port_reply(move || engine(&host, &call.client).test()).await
}

async fn add<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<String, String>> {
    port_reply(move || {
        let req = crate::AddTorrentReq {
            magnet_or_url: &call.args.magnet_or_url,
            download_dir: call.args.download_dir.as_deref(),
            label: &call.args.label,
            only_files: None,
            torrent_bytes: None,
        };
        engine(&host, &call.client).add(&req)
    })
    .await
}

// Not the `Result` envelope: `None` is a torrent the engine has forgotten, which
// is a normal state the consumer reconciles rather than a failure.
async fn status<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Option<Status>> {
    let found = tokio::task::spawn_blocking(move || {
        engine(&host, &call.client)
            .status(&call.args.client_ref)
            .ok()
            .flatten()
            .map(wire)
    })
    .await
    .ok()
    .flatten();
    Json(found)
}

fn wire(s: crate::TorrentStatus) -> Status {
    Status {
        client_ref: s.client_ref,
        name: s.name,
        info_hash: s.info_hash,
        progress: s.progress,
        state: serde_json::to_value(s.state)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| "error".into()),
        down_bps: s.down_bps,
        up_bps: s.up_bps,
        peers: s.peers,
        peers_seen: s.peers_seen,
        size_bytes: s.size_bytes,
        save_path: s.save_path,
        files: s.files,
        error: s.error,
    }
}

async fn pause<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&host, &call.client).pause(&call.args.client_ref)).await
}

async fn resume<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&host, &call.client).resume(&call.args.client_ref)).await
}

async fn reannounce<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&host, &call.client).reannounce(&call.args.client_ref)).await
}

async fn remove<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || {
        engine(&host, &call.client).remove(&call.args.client_ref, call.args.delete_data)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::http::StatusCode;
    use serde_json::json;

    // The routes as the core's reverse proxy drives them, against a daemon that is
    // not there. What that pins is the ENVELOPE: a failure has to arrive inside
    // `Err` so the caller sees the reason, because a 500 would surface as a
    // transport error and lose it.
    async fn call(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
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
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
        )
    }

    fn unreachable_client() -> serde_json::Value {
        // Port 1 is reserved and nothing listens on it.
        json!({ "url": "http://127.0.0.1:1", "username": "u", "password": "p" })
    }

    #[tokio::test]
    async fn every_method_is_mounted_where_the_consumer_calls_it() {
        // A path renamed on one side only fails at runtime, in another process,
        // with no compile error anywhere.
        for method in ["test", "add", "pause", "resume", "reannounce", "remove"] {
            let (status, answer) = call(
                &format!("/_port/tv.kroma.torrents/client/{method}"),
                json!({ "client": unreachable_client(), "args": { "client_ref": "abc" } }),
            )
            .await;

            assert_eq!(status, StatusCode::OK, "{method}");
            assert!(
                answer["Err"].is_string(),
                "{method} lost its reason: {answer}"
            );
        }
    }

    // `status` answers `Option`, not the envelope: a torrent the daemon has
    // forgotten is a normal state the consumer reconciles, and an unreachable
    // daemon reads the same way rather than failing the monitor tick.
    #[tokio::test]
    async fn status_answers_null_rather_than_an_envelope() {
        let (status, answer) = call(
            "/_port/tv.kroma.torrents/client/status",
            json!({ "client": unreachable_client(), "args": { "client_ref": "abc" } }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert!(answer.is_null(), "{answer}");
    }

    #[tokio::test]
    async fn an_add_carries_its_link_through_to_the_daemon_call() {
        let (status, answer) = call(
            "/_port/tv.kroma.torrents/client/add",
            json!({
                "client": unreachable_client(),
                "args": { "magnet_or_url": "magnet:?xt=urn:btih:AB", "label": "kroma" },
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert!(answer["Err"].is_string(), "{answer}");
    }

    #[tokio::test]
    async fn a_body_with_no_client_at_all_is_rejected_by_the_extractor() {
        let (status, _) = call("/_port/tv.kroma.torrents/client/test", json!({})).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[test]
    fn every_call_carries_the_client_it_is_for() {
        let body = json!({
            "client": { "url": "http://nas:8080", "username": "u", "password": "p" },
            "args": { "client_ref": "abc" },
        });

        let call: Call = serde_json::from_value(body).unwrap();

        assert_eq!(call.client.url, "http://nas:8080");
        assert_eq!(call.client.password, "p");
        assert_eq!(call.args.client_ref, "abc");
    }

    // The consumer sends three fields for an add; the rest of `Args` defaults so
    // one body shape serves every method.
    #[test]
    fn an_add_arrives_with_a_link_a_directory_and_a_label() {
        let body = json!({
            "client": { "url": "http://nas:8080" },
            "args": {
                "magnet_or_url": "magnet:?xt=urn:btih:AB",
                "download_dir": "/downloads",
                "label": "kroma",
            },
        });

        let call: Call = serde_json::from_value(body).unwrap();

        assert_eq!(call.args.magnet_or_url, "magnet:?xt=urn:btih:AB");
        assert_eq!(call.args.download_dir.as_deref(), Some("/downloads"));
        assert_eq!(call.args.label, "kroma");
        assert!(!call.args.delete_data);
    }

    #[test]
    fn a_call_with_no_args_at_all_is_accepted() {
        // `test` takes none, and a missing `args` must not be a 422.
        let call: Call =
            serde_json::from_value(json!({ "client": { "url": "http://nas:8080" } })).unwrap();

        assert_eq!(call.args.client_ref, "");
    }

    #[test]
    fn a_status_answers_the_keys_the_consumer_reads() {
        let json = serde_json::to_value(Status {
            client_ref: "abc".into(),
            name: "The.Matrix".into(),
            info_hash: Some("ab".into()),
            progress: 0.5,
            state: "downloading".into(),
            down_bps: 1,
            up_bps: 2,
            peers: 3,
            peers_seen: 4,
            size_bytes: 5,
            save_path: Some("/downloads".into()),
            files: vec!["a.mkv".into()],
            error: None,
        })
        .unwrap();

        assert_eq!(json["client_ref"], "abc");
        assert_eq!(json["progress"], 0.5);
        assert_eq!(json["state"], "downloading");
        assert_eq!(json["peers_seen"], 4);
        assert_eq!(json["save_path"], "/downloads");
        assert_eq!(json["files"][0], "a.mkv");
    }

    // The state is a lowercase string on the wire, which is what the consumer's
    // own enum deserializes from.
    #[test]
    fn a_state_crosses_as_the_lowercase_word() {
        let status = wire(crate::TorrentStatus {
            client_ref: "abc".into(),
            name: String::new(),
            info_hash: None,
            progress: 1.0,
            state: crate::TorrentState::Seeding,
            down_bps: 0,
            up_bps: 0,
            peers: 0,
            peers_seen: 0,
            size_bytes: 0,
            save_path: None,
            files: Vec::new(),
            error: None,
        });

        assert_eq!(status.state, "seeding");
    }
}
