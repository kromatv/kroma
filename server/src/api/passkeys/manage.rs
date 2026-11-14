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

/// `DELETE /api/auth/me/passkeys/:id` (Bearer) → 204, `404` if the id does not
/// belong to the caller, `409` if it is the account's last way in.
pub async fn remove(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let config = crate::api::sso::sign_in_config(&state);
    let removed = query(&state.db, move |pool| {
        let mut means = db::sign_in_means(&pool, &user.id)?;
        means.passkeys -= 1;
        if !crate::api::sso::has_a_way_in(&config, &user, &means) {
            return Ok(None);
        }
        db::delete_passkey(&pool, &user.id, &id).map(Some)
    })
    .await;
    match removed {
        Ok(Some(true)) => StatusCode::NO_CONTENT.into_response(),
        Ok(Some(false)) => lerr(loc, StatusCode::NOT_FOUND, "passkey.notFound"),
        Ok(None) => lerr(loc, StatusCode::CONFLICT, "sso.lastWayIn"),
        Err(resp) => resp,
    }
}
