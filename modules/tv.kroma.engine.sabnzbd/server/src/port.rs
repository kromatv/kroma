//! The `download-client` point this module answers, under the instance
//! `sabnzbd`.
//!
//! The download module defines the point and resolves it by instance, so this
//! module links nothing of it: it declares the kind in its `module.json`, parses
//! the JSON below with structs of its own, and drives a SABnzbd.
//!
//! Every method carries the client it is for. This process is stateless about
//! which of the operator's configured clients it is serving.

use std::collections::HashMap;

use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use kroma_module_sdk::host::{port_reply, run_blocking};

use crate::{AddNzbReq, ClientDef, JobStatus, Sabnzbd, USENET};

/// The routes this module mounts.
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/client/caps", post(caps))
        .route("/_port/tv.kroma.torrents/client/test", post(test))
        .route("/_port/tv.kroma.torrents/client/add", post(add))
        .route("/_port/tv.kroma.torrents/client/status", post(status))
        .route("/_port/tv.kroma.torrents/client/pause", post(pause))
        .route("/_port/tv.kroma.torrents/client/resume", post(resume))
        .route("/_port/tv.kroma.torrents/client/reannounce", post(reannounce))
        .route("/_port/tv.kroma.torrents/client/remove", post(remove))
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct Client {
    url: String,
    settings: HashMap<String, Value>,
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

#[derive(Debug, Clone, Serialize)]
struct Status {
    client_ref: String,
    name: String,
    info_hash: Option<String>,
    progress: f64,
    state: crate::JobState,
    down_bps: u64,
    up_bps: u64,
    peers: u32,
    peers_seen: u32,
    size_bytes: u64,
    save_path: Option<String>,
    files: Vec<String>,
    error: Option<String>,
    lifetime_downloaded_bytes: u64,
    lifetime_uploaded_bytes: u64,
}

fn wire(job: JobStatus) -> Status {
    Status {
        client_ref: job.client_ref,
        name: job.name,
        info_hash: None,
        progress: job.progress,
        state: job.state,
        down_bps: job.down_bps,
        up_bps: 0,
        peers: 0,
        peers_seen: 0,
        size_bytes: job.size_bytes,
        save_path: job.save_path,
        files: Vec::new(),
        error: job.error,
        lifetime_downloaded_bytes: job.downloaded_bytes,
        lifetime_uploaded_bytes: 0,
    }
}

fn api_key(client: &Client) -> &str {
    client
        .settings
        .get("apiKey")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn engine(client: &Client) -> Sabnzbd {
    Sabnzbd::new(&ClientDef {
        url: client.url.clone(),
        api_key: api_key(client).to_string(),
    })
}

async fn caps() -> Json<Result<Caps, String>> {
    Json(Ok(Caps {
        protocols: vec![USENET],
    }))
}

async fn test(Json(call): Json<Call>) -> Json<Result<String, String>> {
    port_reply(move || engine(&call.client).test()).await
}

async fn add(Json(call): Json<Call>) -> Json<Result<String, String>> {
    port_reply(move || {
        let req = AddNzbReq {
            protocol: &call.args.protocol,
            url: &call.args.magnet_or_url,
            name: &call.args.name,
            label: &call.args.label,
        };
        engine(&call.client).add(&req)
    })
    .await
}

async fn status(Json(call): Json<Call>) -> Result<Json<Option<Status>>, (StatusCode, String)> {
    let polled = run_blocking(move || engine(&call.client).status(&call.args.client_ref))
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    polled
        .map(|found| Json(found.map(wire)))
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("{e:#}")))
}

async fn pause(Json(call): Json<Call>) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).pause(&call.args.client_ref)).await
}

async fn resume(Json(call): Json<Call>) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).resume(&call.args.client_ref)).await
}

async fn reannounce(Json(_call): Json<Call>) -> Json<Result<(), String>> {
    Json(Ok(()))
}

async fn remove(Json(call): Json<Call>) -> Json<Result<(), String>> {
    port_reply(move || engine(&call.client).remove(&call.args.client_ref, call.args.delete_data))
        .await
}

#[cfg(test)]
mod tests;
