//! Resume positions: one item's saved position, the whole list, and the
//! "Continue watching" rail built from it.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::api::visibility;
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct ProgressBody {
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
}

/// `PUT /api/progress/:id` (Bearer) `{ positionMs, durationMs }` → 204.
pub async fn save_progress(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
    Json(body): Json<ProgressBody>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    let pos = body.position_ms.max(0);
    match query(&state.db, move |pool| {
        db::upsert_progress(&pool, &user.id, &item_id, pos, body.duration_ms)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/progress/:id` (Bearer) → 204 (finished / removed from Continue).
pub async fn delete_progress(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::delete_progress(&pool, &user.id, &item_id)
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
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::get_progress(&pool, &user.id, &item_id)
    })
    .await
    {
        Ok(entry) => Json(entry).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/progress` (Bearer) → `ProgressEntry[]` (all saved positions).
pub async fn list_progress(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let uid = user.id.clone();
    let mut entries = match query(&state.db, move |pool| db::list_progress(&pool, &uid)).await {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let ids = entries.iter().map(|e| e.item_id.clone()).collect();
    match visibility::visible_item_ids(&state, &user, ids).await {
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
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| {
        let mut rows = db::continue_watching(&pool, &uid)?;
        db::localize::overlay_each(&pool, rows.iter_mut().map(|r| &mut r.item), locale)?;
        Ok(rows)
    })
    .await
    {
        Ok(mut rows) => {
            if !user.sees_every_library() {
                rows.retain(|row| user.sees_library(&row.item.library));
            }
            Json(rows).into_response()
        }
        Err(resp) => resp,
    }
}
