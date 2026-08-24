//! Catalogue browse + detail endpoints (libraries / items / movies / shows) plus
//! the server status / scan / logs handlers.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;
use axum::routing::{get, post};
use axum::Router;

/// Unauthenticated: the TV health monitor polls `/api/health` before any login.
/// `/splash` is the deliberate exception to "no catalogue data before a
/// session": a fixed-size random sample of covers for the sign-in screen,
/// never a listing. `/health` and `/status` may not leak catalogue data.
pub fn public_routes() -> Router<SharedState> {
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/splash", get(splash))
}

/// Gated by the session middleware in [`super`] so the library isn't listable
/// anonymously.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/libraries", get(list_libraries))
        .route("/items", get(list_items))
        .route("/movies", get(list_movies))
        .route("/shows", get(list_shows))
        .route("/shows/{id}", get(get_show))
        .route("/items/{id}", get(get_item))
        .route("/logs", get(logs))
        .route("/scan", post(rescan))
}

#[derive(Debug, Deserialize)]
pub struct LibraryQuery {
    pub library: Option<String>,
}

/// `GET /api/splash` → `SplashEntry[]`: a random sample of backdrop art with
/// title/year captions, for the sign-in screen's ambient slideshow. The
/// sample is small and random on every call, so the catalogue stays
/// unlistable without a session.
pub async fn splash(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
) -> Result<Response, Response> {
    let entries = query(&state.db, move |pool| db::splash_entries(&pool, 12, locale)).await?;
    Ok(Json(entries).into_response())
}

/// `GET /api/health`. Public, so the human-readable server name is attached for
/// LAN callers only.
pub async fn health(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: axum::http::HeaderMap,
) -> Result<Response, Response> {
    let (libraries, items, shows) = query(&state.db, move |pool| db::counts(&pool)).await?;
    let ip = crate::api::util::client_ip(&headers, &addr, &state.config.trusted_proxies);
    let is_lan = crate::services::playback::is_lan(
        &ip,
        &crate::services::settings::local_networks(&state.settings),
    );
    Ok(Json(super::dto::Health {
        status: "ok",
        name: is_lan.then(|| crate::services::settings::server_name(&state.settings)),
        instance_id: state.instance_id.clone(),
        version: env!("CARGO_PKG_VERSION"),
        ffprobe: state.ffprobe_available,
        libraries,
        items,
        shows,
    })
    .into_response())
}

/// `GET /api/libraries` → `Library[]`
pub async fn list_libraries(State(state): State<SharedState>) -> Result<Response, Response> {
    let libs = query(&state.db, move |pool| db::list_libraries(&pool)).await?;
    Ok(Json(libs).into_response())
}

/// `GET /api/items` (optional `?library=`) → all playable items (movies + episodes).
pub async fn list_items(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let items = query(&state.db, move |pool| {
        let mut items = db::list_items(&pool, q.library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    Ok(Json(items).into_response())
}

/// `GET /api/movies` (optional `?library=`) → `MediaItem[]` (movies only).
pub async fn list_movies(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let items = query(&state.db, move |pool| {
        let mut items = db::list_movies(&pool, q.library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    Ok(Json(items).into_response())
}

/// `GET /api/shows` (optional `?library=`) → `Show[]`. Personalises each show's
/// `progress` (series completion) for the calling account.
pub async fn list_shows(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let uid = user.id;
    let shows = query(&state.db, move |pool| {
        let mut shows = db::list_shows(&pool, q.library.as_deref())?;
        let prog = db::show_progress(&pool, &uid).unwrap_or_default();
        for s in &mut shows {
            s.progress = prog.get(&s.id).copied();
        }
        db::localize::overlay_shows(&pool, &mut shows, locale)?;
        Ok(shows)
    })
    .await?;
    Ok(Json(shows).into_response())
}

/// `GET /api/shows/:id` → `{ show, seasons[] }`. Fills `show.progress` for the
/// calling account.
pub async fn get_show(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let uid = user.id;
    let detail = query(&state.db, move |pool| {
        let Some(mut detail) = db::get_show(&pool, &id)? else {
            return Ok(None);
        };
        detail.show.progress = db::show_progress_one(&pool, &uid, &detail.show.id).unwrap_or(None);
        db::localize::overlay_show_detail(&pool, &mut detail, locale)?;
        Ok(Some(detail))
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "show not found"))?;
    Ok(Json(detail).into_response())
}

/// `GET /api/items/:id` → `MediaItem`
pub async fn get_item(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let item = query(&state.db, move |pool| {
        let Some(mut item) = db::get_item(&pool, &id)? else {
            return Ok(None);
        };
        db::localize::overlay_items(&pool, std::slice::from_mut(&mut item), locale)?;
        Ok(Some(item))
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;
    Ok(Json(item).into_response())
}

/// `POST /api/scan` → trigger a full library rescan. Routed through the tracked
/// `library.scan` job so it shares the job manager's single-flight guard: no
/// concurrent walk can race a watch-triggered run on the same DB.
pub async fn rescan(State(state): State<SharedState>) -> Result<Response, Response> {
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
    Query(q): Query<LogsQuery>,
) -> Result<Response, Response> {
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
