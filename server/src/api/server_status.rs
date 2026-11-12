//! The server's own status: the public health and status probes, the log tail
//! and a manual rescan.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::state::SharedState;

/// Unauthenticated: the TV health monitor polls `/api/health` before any login.
/// Neither route may leak catalogue data.
pub fn public_routes() -> Router<SharedState> {
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
}

/// Gated by the session middleware in [`super`].
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/logs", get(logs))
        .route("/scan", post(rescan))
}

/// `GET /api/health`. Public, so the human-readable server name is attached for
/// LAN callers only.
pub async fn health(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: axum::http::HeaderMap,
) -> Result<Response, Response> {
    let counts = state.library_counts.current(&state.db).await.map_err(|e| {
        tracing::error!(error = %e, "reading the library counts failed");
        json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")
    })?;
    let ip = crate::api::util::client_ip(&headers, &addr, &state.config.trusted_proxies);
    let is_lan = crate::services::playback::is_lan(
        &ip,
        &crate::services::settings::local_networks(&state.settings),
    );
    let build = crate::services::settings::build_info();
    Ok(Json(super::dto::Health {
        build: build.number,
        commit: build.commit,
        boot_id: kroma_engine::boot_id(),
        active_streams: is_lan.then(|| state.playback.list().len()),
        auto_install_updates: is_lan.then(|| crate::services::updates::auto_install(&state)),
        status: "ok",
        name: is_lan.then(|| crate::services::settings::server_name(&state.settings)),
        instance_id: state.instance_id.clone(),
        version: crate::VERSION,
        update_channel: is_lan.then(|| crate::services::updates::channel(&state.settings)),
        ffprobe: state.ffprobe_available,
        libraries: counts.libraries,
        items: counts.items,
        shows: counts.shows,
    })
    .into_response())
}

/// `POST /api/scan` → trigger a full library rescan. Routed through the tracked
/// `library.scan` job so it shares the job manager's single-flight guard: no
/// concurrent walk can race a watch-triggered run on the same DB.
pub async fn rescan(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    crate::api::admin::require(&user, crate::model::Permission::LibraryManage)?;
    use crate::services::jobs::{JobKey, TriggerError};
    match state
        .jobs
        .trigger(state.clone(), JobKey("library.scan"), "manual")
    {
        Ok(run_id) => Ok(Json(serde_json::json!({ "runId": run_id })).into_response()),
        Err(TriggerError::AlreadyRunning) => Err(json_error(
            StatusCode::CONFLICT,
            "a scan is already running",
        )),
        Err(TriggerError::Unknown) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "scan job not registered",
        )),
    }
}

/// `GET /api/status` → live scan/enrichment snapshot.
pub async fn status(State(state): State<SharedState>) -> Response {
    let snap = crate::services::activity::snapshot(&state.activity);
    Json(snap).into_response()
}

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub tail: Option<usize>,
}

/// `GET /api/logs?tail=N` → the last N lines of the current server log, as
/// `text/plain`. Reads the most-recently-modified file under `<data>/logs/`.
pub async fn logs(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<LogsQuery>,
) -> Result<Response, Response> {
    crate::api::admin::require_any_admin(&user)?;
    let dir = state.config.logs_dir();
    let tail = q.tail.unwrap_or(200).min(5000);

    let text = blocking(move || Ok(read_log_tail(&dir, tail))).await?;
    Ok(([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], text).into_response())
}

fn read_log_tail(dir: &std::path::Path, tail: usize) -> String {
    let newest = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter_map(|p| {
            let mtime = std::fs::metadata(&p).and_then(|m| m.modified()).ok()?;
            Some((mtime, p))
        })
        .max_by_key(|(mtime, _)| *mtime)
        .map(|(_, p)| p);

    let Some(path) = newest else {
        return String::new();
    };
    let content = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        // Keep the always-200, text/plain contract, but don't swallow a real
        // read failure.
        tracing::warn!(path = %path.display(), error = %e, "failed to read log file for /api/logs");
        String::new()
    });
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(tail);
    lines[start..].join("\n")
}
