//! The `download-client` point this module answers, under the instance
//! `nzbget`. The downloads module defines the point; this one parses the JSON
//! below with structs of its own.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{port_reply, HostCtx};

use crate::{AddReq, ClientDef, JobStatus, NzbGet, PROTOCOL};

pub fn routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/client/caps", post(caps::<S>))
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
    protocol: String,
    magnet_or_url: String,
    name: String,
    label: String,
    client_ref: String,
    delete_data: bool,
}

#[derive(Debug, Serialize)]
struct Caps {
    protocols: Vec<&'static str>,
}

fn engine(client: &Client) -> NzbGet {
    NzbGet::new(&ClientDef {
        url: client.url.clone(),
        username: client.username.clone(),
        password: client.password.clone(),
    })
}

async fn caps<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(_call): Json<Call>,
) -> Json<Result<Caps, String>> {
    port_reply(|| {
        Ok(Caps {
            protocols: vec![PROTOCOL],
        })
    })
    .await
}

async fn test<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<String, String>> {
    port_reply(move || engine(&call.client).test()).await
}

async fn add<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<String, String>> {
    port_reply(move || {
        engine(&call.client).add(&AddReq {
            protocol: &call.args.protocol,
            url: &call.args.magnet_or_url,
            name: &call.args.name,
            label: &call.args.label,
        })
    })
    .await
}

async fn status<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Result<Json<Option<JobStatus>>, (axum::http::StatusCode, String)> {
    let gateway = axum::http::StatusCode::BAD_GATEWAY;
    let polled = kroma_module_sdk::host::run_blocking(move || {
        engine(&call.client).status(&call.args.client_ref)
    })
    .await
    .map_err(|e| (gateway, e.to_string()))?;
    polled.map(Json).map_err(|e| (gateway, format!("{e:#}")))
}

async fn pause<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).pause(&call.args.client_ref)).await
}

async fn resume<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).resume(&call.args.client_ref)).await
}

async fn reannounce<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(_call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(|| Ok(())).await
}

async fn remove<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_host): State<S>,
    Json(call): Json<Call>,
) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).remove(&call.args.client_ref, call.args.delete_data))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::http::StatusCode;
    use serde_json::{json, Value};

    async fn call(path: &str, body: Value) -> (StatusCode, Value) {
        let host = kroma_module_sdk::host::testing::StubHost::new();
        let app = routes::<kroma_module_sdk::host::testing::StubHost>().with_state(host);
        let req = axum::http::Request::builder()
            .method("POST")
            .uri(format!("/_port/tv.kroma.torrents/client/{path}"))
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

    fn unreachable_client() -> Value {
        json!({ "url": "http://127.0.0.1:1", "username": "u", "password": "p" })
    }

    #[tokio::test]
    async fn caps_answers_usenet_inside_the_ok_envelope() {
        let (status, answer) = call("caps", json!({ "client": unreachable_client(), "args": {} })).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(answer, json!({ "Ok": { "protocols": ["usenet"] } }));
    }

    #[tokio::test]
    async fn reannounce_is_a_no_op_that_succeeds() {
        let (status, answer) = call(
            "reannounce",
            json!({ "client": unreachable_client(), "args": { "client_ref": "7" } }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(answer, json!({ "Ok": null }));
    }

    #[tokio::test]
    async fn every_networked_method_fails_inside_err_when_the_daemon_is_down() {
        for method in ["test", "pause", "resume", "remove"] {
            let (status, answer) = call(
                method,
                json!({ "client": unreachable_client(), "args": { "client_ref": "7" } }),
            )
            .await;

            assert_eq!(status, StatusCode::OK, "{method}");
            assert!(answer["Err"].is_string(), "{method}: {answer}");
        }
    }

    #[tokio::test]
    async fn an_add_for_a_torrent_is_refused_before_any_request_is_made() {
        for protocol in ["torrent", ""] {
            let (status, answer) = call(
                "add",
                json!({
                    "client": unreachable_client(),
                    "args": { "protocol": protocol, "magnet_or_url": "http://x/a.nzb", "name": "n", "label": "kroma" },
                }),
            )
            .await;

            assert_eq!(status, StatusCode::OK);
            assert!(
                answer["Err"].as_str().unwrap().contains("usenet releases only"),
                "{answer}"
            );
        }
    }

    #[tokio::test]
    async fn a_daemon_that_cannot_be_reached_is_a_failed_poll_not_a_forgotten_job() {
        let (status, _) = call(
            "status",
            json!({ "client": unreachable_client(), "args": { "client_ref": "7" } }),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn a_body_with_no_client_is_rejected_by_the_extractor() {
        let (status, _) = call("test", json!({})).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[test]
    fn an_add_arrives_with_a_protocol_a_link_a_name_and_a_label() {
        let call: Call = serde_json::from_value(json!({
            "client": { "url": "http://nas:6789", "username": "u", "password": "p" },
            "args": {
                "protocol": "usenet",
                "magnet_or_url": "http://idx/a.nzb",
                "name": "Some.Show",
                "download_dir": "/ignored",
                "label": "kroma",
            },
        }))
        .unwrap();

        assert_eq!(call.args.protocol, "usenet");
        assert_eq!(call.args.magnet_or_url, "http://idx/a.nzb");
        assert_eq!(call.args.name, "Some.Show");
        assert_eq!(call.client.password, "p");
    }

    #[test]
    fn a_call_with_no_args_is_accepted() {
        let call: Call =
            serde_json::from_value(json!({ "client": { "url": "http://nas:6789" } })).unwrap();

        assert_eq!(call.args.client_ref, "");
    }
}
