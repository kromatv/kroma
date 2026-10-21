use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::dto::PasskeyInfo;
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;

/// `GET /api/auth/me/passkeys` (Bearer) → `PasskeyInfo[]`, newest first.
pub async fn list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::list_passkeys(&pool, &uid)).await {
        Ok(rows) => {
            let out: Vec<PasskeyInfo> = rows
                .into_iter()
                .map(|r| PasskeyInfo {
                    id: r.id,
                    name: r.name,
                    created_at: r.created_at,
                    last_used: r.last_used,
                })
                .collect();
            Json(out).into_response()
        }
        Err(resp) => resp,
    }
}

/// `DELETE /api/auth/me/passkeys/:id` (Bearer) → 204, or `404` if the id does
/// not belong to the caller.
pub async fn remove(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::delete_passkey(&pool, &uid, &id)).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => lerr(loc, StatusCode::NOT_FOUND, "passkey.notFound"),
        Err(resp) => resp,
    }
}
