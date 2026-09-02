//! Email verification: the public check and confirm handlers. No code here —
//! reaching the mailbox is itself the proof, so the link alone suffices. The
//! link verifies nothing once the account's address no longer matches the one
//! it was minted for (ADMIN-87).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;

/// A token is usable only while unused, unexpired, and still naming the
/// account's current address.
async fn usable(state: &SharedState, token: &str) -> Result<Option<(String, String)>, Response> {
    let token = token.trim().to_string();
    let Some(v) = query(&state.db, move |pool| db::get_verification(&pool, &token)).await? else {
        return Ok(None);
    };
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    if v.used_at.is_some() || v.expires_at <= now {
        return Ok(None);
    }
    let uid = v.user_id.clone();
    let Some(user) = query(&state.db, move |pool| db::user_by_id(&pool, &uid)).await? else {
        return Ok(None);
    };
    if !user.email.eq_ignore_ascii_case(&v.email) {
        return Ok(None);
    }
    Ok(Some((v.user_id, user.username)))
}

/// `GET /api/auth/verify-email/:token` → `{ valid, username? }`, so the page can
/// greet the user without leaking their email.
pub async fn check_verification(
    State(state): State<SharedState>,
    Path(token): Path<String>,
) -> Response {
    match usable(&state, &token).await {
        Ok(Some((_, username))) => Json(crate::api::dto::ResetCheck {
            valid: true,
            username: Some(username),
        })
        .into_response(),
        Ok(None) => Json(crate::api::dto::ResetCheck {
            valid: false,
            username: None,
        })
        .into_response(),
        Err(resp) => resp,
    }
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailBody {
    pub token: String,
}

/// `POST /api/auth/verify-email` `{ token }` → 204. A bare GET never consumes:
/// mail scanners prefetch links, and a prefetch must not verify anything.
pub async fn confirm_verification(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    Json(body): Json<VerifyEmailBody>,
) -> Response {
    let token = body.token.trim().to_string();
    match query(&state.db, move |pool| db::confirm_verification(&pool, &token)).await {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => lerr(loc, StatusCode::BAD_REQUEST, "auth.verificationInvalid"),
        Err(resp) => resp,
    }
}
