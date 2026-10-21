//! Installed-module frontend assets: serves an installed module's Module
//! Federation remote (`remoteEntry.js` + chunks) from `<data>/modules/:id/fe/*`,
//! public like the icon route.

use std::path::{Component, PathBuf};

use axum::extract::{Path, Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::state::SharedState;

/// Public FE-asset serving, mounted at the app root (before the SPA fallback).
pub fn asset_routes() -> Router<SharedState> {
    Router::new().route("/modules/{id}/{*path}", get(serve_fe))
}

async fn serve_fe(
    State(state): State<SharedState>,
    Path((id, path)): Path<(String, String)>,
    req: Request,
) -> Response {
    // Rebuild both id and path from Normal components so neither can escape the
    // module's fe dir.
    let Some(id) = safe_segment(&id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let rel: PathBuf = PathBuf::from(&path)
        .components()
        .filter_map(|c| match c {
            Component::Normal(p) => Some(p),
            _ => None,
        })
        .collect();
    if rel.as_os_str().is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let file = state
        .config
        .data_dir
        .join("modules")
        .join(id)
        .join("fe")
        .join(&rel);
    if !tokio::fs::metadata(&file).await.is_ok_and(|m| m.is_file()) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Ok(res) = ServeFile::new(&file).oneshot(req).await;
    let mut res = res.into_response();
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type_for(&rel)),
    );
    res
}

// A plain path segment: rejects `.`, `..`, and separators to block traversal.
fn safe_segment(s: &str) -> Option<&str> {
    if s.is_empty() || s == "." || s == ".." || s.contains(['/', '\\']) {
        None
    } else {
        Some(s)
    }
}

fn content_type_for(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(std::ffi::OsStr::to_str) {
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("map") => "application/json",
        Some("html") => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}
