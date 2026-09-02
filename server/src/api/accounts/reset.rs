//! Credential reset: the public check and redeem handlers, plus the sign-in
//! screen's "forgot password" request.

use std::net::SocketAddr;
use std::sync::LazyLock;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::util::{client_ip, query};
use crate::db;
use crate::i18n::ReqLocale;
use crate::services::auth;
use crate::services::pairing::throttle::Throttle;
use crate::state::SharedState;

use super::credentials::MIN_PASSWORD_LEN;

/// Reset requests from one source IP per window: enough for a mistyped
/// identifier, not enough to spam the owner's member list.
static REQUEST_THROTTLE: LazyLock<Throttle> = LazyLock::new(|| Throttle::new(5, 600));

#[derive(Debug, Deserialize)]
pub struct ResetRequestBody {
    pub identifier: String,
}

/// `POST /api/auth/reset-request` `{ identifier }` → 204, always. The answer is
/// uniform whether or not the identifier names an account, so the sign-in
/// screen never reveals who is registered; a matching account is marked for the
/// owner, who mints the reset by hand.
pub async fn request_reset(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<ResetRequestBody>,
) -> Response {
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    if !REQUEST_THROTTLE.admit(&ip) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let identifier = body.identifier.trim().to_string();
    if identifier.is_empty() {
        return StatusCode::NO_CONTENT.into_response();
    }
    let found = query(&state.db, move |pool| {
        db::find_user_by_login(&pool, &identifier)
    })
    .await;
    if let Ok(Some((user, _))) = found {
        let _ = query(&state.db, move |pool| db::request_reset(&pool, &user.id)).await;
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
pub struct ResetBody {
    pub token: String,
    pub code: String,
    pub password: String,
}

/// `GET /api/auth/reset/:token` → `{ valid, username? }`. Public, so the reset
/// page can greet the user without leaking their email.
pub async fn check_reset(
    State(state): State<SharedState>,
    Path(token): Path<String>,
) -> Response {
    let reset = match query(&state.db, move |pool| db::get_reset(&pool, &token)).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return Json(crate::api::dto::ResetCheck {
                valid: false,
                username: None,
            })
            .into_response()
        }
        Err(resp) => return resp,
    };
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let valid = reset.used_at.is_none()
        && reset.expires_at > now
        && reset.attempts < db::MAX_RESET_ATTEMPTS;
    let username = if valid {
        let uid = reset.user_id.clone();
        match query(&state.db, move |pool| db::user_by_id(&pool, &uid)).await {
            Ok(Some(u)) => Some(u.username),
            _ => None,
        }
    } else {
        None
    };
    Json(crate::api::dto::ResetCheck { valid, username }).into_response()
}

/// `POST /api/auth/reset` `{ token, code, password }` → 204. The link alone is
/// not enough; the user must also enter the code the owner read to them.
pub async fn redeem_reset(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    Json(body): Json<ResetBody>,
) -> Response {
    if body.password.len() < MIN_PASSWORD_LEN {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.passwordTooShort");
    }
    let token = body.token.trim().to_string();
    let reset = match query(&state.db, move |pool| db::get_reset(&pool, &token)).await {
        Ok(Some(r)) => r,
        Ok(None) => return lerr(loc, StatusCode::BAD_REQUEST, "auth.resetInvalid"),
        Err(resp) => return resp,
    };
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    if reset.used_at.is_some() || reset.expires_at <= now {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.resetInvalid");
    }
    if reset.attempts >= db::MAX_RESET_ATTEMPTS {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.resetLocked");
    }
    if !auth::verify_password(&body.code, &reset.code_hash) {
        let token = body.token.trim().to_string();
        let _ = query(&state.db, move |pool| {
            db::bump_reset_attempts(&pool, &token)
        })
        .await;
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.resetInvalid");
    }
    let token = body.token.trim().to_string();
    let user_id = match query(&state.db, move |pool| db::consume_reset(&pool, &token)).await {
        Ok(Some(uid)) => uid,
        Ok(None) => return lerr(loc, StatusCode::BAD_REQUEST, "auth.resetInvalid"),
        Err(resp) => return resp,
    };
    let hash = auth::hash_password(&body.password);
    let uid = user_id.clone();
    if let Err(resp) = query(&state.db, move |pool| {
        db::set_user_password(&pool, &uid, &hash)
    })
    .await
    {
        return resp;
    }
    let uid = user_id.clone();
    let _ = query(&state.db, move |pool| db::revoke_all_sessions(&pool, &uid)).await;
    StatusCode::NO_CONTENT.into_response()
}
