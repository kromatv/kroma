//! The flags a person sets on a title themselves: watched, and "Ma liste".

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::util::query;
use crate::api::visibility::{self, AuthViewer, Viewer};
use crate::db;
use crate::state::SharedState;

/// `PUT /api/watched/:id` (Bearer) → 204. Marks the item watched and clears its
/// resume position (drops it from "Continue watching").
pub async fn mark_watched(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(subject_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_saved(&state, &viewer, &subject_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::mark_watched(&pool, &viewer.user.id, &subject_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/watched/:id` (Bearer) → 204. Clears the watched flag.
pub async fn unmark_watched(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(subject_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_saved(&state, &viewer, &subject_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::unmark_watched(&pool, &viewer.user.id, &subject_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/watched` (Bearer) → `string[]` (item ids the user marked watched).
pub async fn list_watched(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
) -> Response {
    let uid = viewer.user.id.clone();
    match query(&state.db, move |pool| db::list_watched(&pool, &uid)).await {
        Ok(ids) => visible_ids(&state, &viewer, ids).await,
        Err(resp) => resp,
    }
}

/// `PUT /api/my-list/:id` (Bearer) → 204. Adds a title to the user's list.
pub async fn add_to_list(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(subject_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_saved(&state, &viewer, &subject_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::add_to_list(&pool, &viewer.user.id, &subject_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/my-list/:id` (Bearer) → 204. Removes a title from the user's list.
pub async fn remove_from_list(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    Path(subject_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_saved(&state, &viewer, &subject_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::remove_from_list(&pool, &viewer.user.id, &subject_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/my-list` (Bearer) → `string[]` (item ids in the user's list).
pub async fn list_my_list(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
) -> Response {
    let uid = viewer.user.id.clone();
    match query(&state.db, move |pool| db::list_my_list(&pool, &uid)).await {
        Ok(ids) => visible_ids(&state, &viewer, ids).await,
        Err(resp) => resp,
    }
}

async fn visible_ids(state: &SharedState, viewer: &Viewer, ids: Vec<String>) -> Response {
    match visibility::visible_saved_ids(state, viewer, ids.clone()).await {
        Ok(visible) => {
            let kept: Vec<String> = ids.into_iter().filter(|id| visible.contains(id)).collect();
            Json(kept).into_response()
        }
        Err(resp) => resp,
    }
}
