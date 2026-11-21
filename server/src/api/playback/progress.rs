//! Resume positions: one item's saved position, the whole list, and the
//! "Continue watching" rail built from it.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::util::query;
use crate::api::visibility::{self, AuthViewer};
use crate::db;
use crate::i18n::ContentLocale;
use crate::services::settings;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct ProgressBody {
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
}

/// `PUT /api/progress/:id` (Bearer) `{ positionMs, durationMs }` → 200
/// `{ watched }`. The server applies the watched rule here, once for every
/// client: past the credits marker or the played threshold the item is flagged
/// watched, and the position is kept.
pub async fn save_progress(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(item_id): Path<String>,
    Json(body): Json<ProgressBody>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &viewer, &item_id).await {
        return resp;
    }
    let pos = body.position_ms.max(0);
    let played_percent = settings::played_percent(&state.settings);
    match query(&state.db, move |pool| {
        db::save_progress(
            &pool,
            &viewer.user.id,
            &item_id,
            pos,
            body.duration_ms,
            played_percent,
        )
    })
    .await
    {
        Ok(watched) => Json(json!({ "watched": watched })).into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/progress/:id` (Bearer) → 204 (finished / removed from Continue).
pub async fn delete_progress(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &viewer, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::delete_progress(&pool, &viewer.user.id, &item_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/progress/:id` (Bearer) → `ProgressEntry | null` for one item, so the
/// player can resume without fetching the whole list.
pub async fn get_progress(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &viewer, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::get_progress(&pool, &viewer.user.id, &item_id)
    })
    .await
    {
        Ok(entry) => Json(entry).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/progress` (Bearer) → `ProgressEntry[]` (all saved positions).
pub async fn list_progress(State(state): State<SharedState>, AuthViewer(viewer): AuthViewer) -> Response {
    let uid = viewer.user.id.clone();
    let mut entries = match query(&state.db, move |pool| db::list_progress(&pool, &uid)).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let ids = entries.iter().map(|e| e.item_id.clone()).collect();
    match visibility::visible_item_ids(&state, &viewer, ids).await {
        Ok(visible) => {
            entries.retain(|e| visible.contains(&e.item_id));
            Json(entries).into_response()
        }
        Err(resp) => resp,
    }
}

/// `GET /api/continue` (Bearer) → `ContinueItem[]` (resumable, newest first).
pub async fn continue_watching(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
) -> Response {
    let uid = viewer.user.id.clone();
    let played_percent = settings::played_percent(&state.settings);
    match query(&state.db, move |pool| {
        let mut rows = db::continue_watching(&pool, &uid, played_percent)?;
        db::localize::overlay_each(&pool, rows.iter_mut().map(|r| &mut r.item), locale)?;
        Ok(rows)
    })
    .await
    {
        Ok(mut rows) => {
            match visibility::keep_rows(&state, &viewer, &mut rows, |row| &mut row.item).await {
                Ok(()) => Json(rows).into_response(),
                Err(resp) => resp,
            }
        }
        Err(resp) => resp,
    }
}
