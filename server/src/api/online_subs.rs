//! On-device subtitle generation endpoints: kick off a Whisper transcription or an
//! LLM translation, poll its live progress, cancel it, and list/serve/delete the
//! generated tracks. Generation is fire-and-poll: `generate` registers the work and
//! returns a `genId` immediately, then runs on a blocking thread reporting progress
//! into [`crate::services::subtitles::GenRegistry`]; the client polls `generations`.

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::api::error::json_error;
use crate::api::util::query;
use crate::boot::transcriber::TranscriberClient;
use crate::db;
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::{delete, get, post};
use axum::Router;

mod generate;

use generate::{cancel_generation, generate, generations};

/// Authenticated subtitle generation/management endpoints (gated by the session
/// middleware).
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/items/{id}/subtitles/generate", post(generate))
        .route("/items/{id}/subtitles/capabilities", get(capabilities))
        .route("/items/{id}/subtitles/generations", get(generations))
        .route(
            "/items/{id}/subtitles/generations/{gen}",
            delete(cancel_generation),
        )
        .route("/items/{id}/subtitles/downloaded", get(list))
        .route(
            "/items/{id}/subtitles/downloaded/{dl}",
            delete(delete_downloaded),
        )
}

/// Public: serve a generated/downloaded subtitle's WebVTT bytes. The player
/// fetches this URL as a plain `fetch()` (and can't attach a bearer), so like
/// the embedded-subtitle + stream byte routes it stays outside the session gate.
pub fn public_routes() -> Router<SharedState> {
    Router::new().route("/items/{id}/subtitles/dl/{dl}", get(file))
}

/// A generated/cached subtitle as the client sees it, with its WebVTT URL.
#[derive(Debug, Serialize)]
pub struct DownloadedSubView {
    pub id: String,
    pub language: Option<String>,
    pub label: String,
    pub provider: String,
    pub url: String,
}

fn to_view(item_id: &str, s: db::DownloadedSub) -> DownloadedSubView {
    DownloadedSubView {
        url: format!("/api/items/{item_id}/subtitles/dl/{}.vtt", s.id),
        id: s.id,
        language: s.language,
        label: s.label,
        provider: s.provider,
    }
}

/// Which generation actions this server build + config enable (so the player hides
/// empty buttons). `transcribe` needs the in-process Whisper feature; `translate`
/// needs a default LLM provider configured (the admin IA page).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubCapabilities {
    pub transcribe: bool,
    pub translate: bool,
}

/// `GET /api/items/:id/subtitles/capabilities`. Server config, not item-specific,
/// but kept under the item path for client convenience.
pub async fn capabilities(State(state): State<SharedState>, Path(_id): Path<String>) -> Response {
    let transcribe = transcriber_available(&state);
    let translate = settings::default_provider(&state.settings).is_some();
    Json(SubCapabilities {
        transcribe,
        translate,
    })
    .into_response()
}

// Transcription runs in whichever module answers the `transcriber` point, so it
// is available when that resolves, not on a compile-time core feature.
// `capabilities` and `generate` must answer from the same check or the player
// offers a button whose endpoint refuses it.
pub(super) fn transcriber_available(state: &SharedState) -> bool {
    kroma_module_host::service::<TranscriberClient>(state).is_some_and(|t| t.available())
}

/// `GET /api/items/:id/subtitles/downloaded` → this item's generated subtitles.
pub async fn list(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let item = id.clone();
    match query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(db::downloaded_subs_for_item(&conn, &item)?)
    })
    .await
    {
        Ok(subs) => Json(
            subs.into_iter()
                .map(|s| to_view(&id, s))
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/items/:id/subtitles/downloaded/:dl` → remove a generated track
/// (DB row + cached WebVTT file).
pub async fn delete_downloaded(
    State(state): State<SharedState>,
    Path((_id, dl)): Path<(String, String)>,
) -> Response {
    let dl_id = dl.trim_end_matches(".vtt").to_string();
    let pool = state.db.clone();
    let path =
        match tokio::task::spawn_blocking(move || db::delete_downloaded_sub(&pool, &dl_id)).await {
            Ok(Ok(p)) => p,
            _ => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "could not delete subtitle",
                )
            }
        };
    match path {
        Some(p) => {
            let _ = tokio::fs::remove_file(&p).await;
            StatusCode::NO_CONTENT.into_response()
        }
        None => json_error(StatusCode::NOT_FOUND, "subtitle not found"),
    }
}

/// `GET /api/items/:id/subtitles/dl/:dl.vtt` → serve a cached generated WebVTT.
pub async fn file(
    State(state): State<SharedState>,
    Path((_id, dl)): Path<(String, String)>,
) -> Response {
    let dl_id = dl.trim_end_matches(".vtt").to_string();
    let sub = match query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(db::downloaded_sub(&conn, &dl_id)?)
    })
    .await
    {
        Ok(Some(s)) => s,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "subtitle not found"),
        Err(resp) => return resp,
    };
    match tokio::fs::read(&sub.path).await {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, "text/vtt; charset=utf-8")
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .body(Body::from(bytes))
            .unwrap(),
        Err(_) => json_error(StatusCode::NOT_FOUND, "subtitle file missing"),
    }
}
