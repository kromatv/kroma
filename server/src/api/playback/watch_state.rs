//! The flags a person sets on a title themselves: watched, and "Ma liste".

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::api::visibility;
use crate::db;
use crate::model::User;
use crate::state::SharedState;

/// `PUT /api/watched/:id` (Bearer) → 204. Marks the item watched and clears its
/// resume position (drops it from "Continue watching").
pub async fn mark_watched(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::mark_watched(&pool, &user.id, &item_id)
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
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::unmark_watched(&pool, &user.id, &item_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/watched` (Bearer) → `string[]` (item ids the user marked watched).
pub async fn list_watched(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::list_watched(&pool, &uid)).await {
        Ok(ids) => visible_ids(&state, &user, ids).await,
        Err(resp) => resp,
    }
}

/// `PUT /api/my-list/:id` (Bearer) → 204. Adds a title to the user's list.
pub async fn add_to_list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::add_to_list(&pool, &user.id, &item_id)
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
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    if let Err(resp) = visibility::gate_item(&state, &user, &item_id).await {
        return resp;
    }
    match query(&state.db, move |pool| {
        db::remove_from_list(&pool, &user.id, &item_id)
    })
    .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/my-list` (Bearer) → `string[]` (item ids in the user's list).
pub async fn list_my_list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::list_my_list(&pool, &uid)).await {
        Ok(ids) => visible_ids(&state, &user, ids).await,
        Err(resp) => resp,
    }
}

async fn visible_ids(state: &SharedState, user: &User, ids: Vec<String>) -> Response {
    match visibility::visible_item_ids(state, user, ids.clone()).await {
        Ok(visible) => {
            let kept: Vec<String> = ids.into_iter().filter(|id| visible.contains(id)).collect();
            Json(kept).into_response()
        }
        Err(resp) => resp,
    }
}
