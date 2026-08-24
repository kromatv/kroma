//! The session lifecycle: minting a device's token pair, exchanging and
//! relocking an access token, and the account's list of signed-in devices.

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::extract::{bearer_from_headers, AuthToken, AuthUser};
use crate::api::pin;
use crate::api::util::query;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::User;
use crate::services::auth;
use crate::state::SharedState;

use super::user_agent;

// Tagged `tokenInvalid` so the client can tell a dead token from a retryable
// wrong-PIN 401 and send the user to re-login instead of looping on the PIN screen.
fn token_invalid(loc: &str) -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": i18n::t(loc, "auth.tokenInvalid", &[]), "tokenInvalid": true })),
    )
        .into_response()
}

#[derive(Debug, Deserialize, Default)]
pub struct LogoutBody {
    #[serde(rename = "accessToken", default)]
    pub access_token: Option<String>,
}

/// `POST /api/auth/logout` → 204. Revokes the bearer session and, when provided, the
/// device's access token; a no-op for missing or unknown tokens.
pub async fn logout(
    State(state): State<SharedState>,
    headers: HeaderMap,
    body: Option<Json<LogoutBody>>,
) -> Response {
    if let Some(token) = bearer_from_headers(&headers) {
        let _ = query(&state.db, move |pool| db::delete_session(&pool, &token)).await;
    }
    if let Some(access) = body
        .and_then(|b| b.0.access_token)
        .filter(|t| !t.is_empty())
    {
        let _ = query(&state.db, move |pool| {
            db::delete_access_token(&pool, &access)
        })
        .await;
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
pub struct RelockBody {
    #[serde(rename = "accessToken")]
    pub access_token: String,
}

/// `POST /api/auth/relock` `{ accessToken }` → 204. Clears the access token's
/// PIN-verified flag so the next switch-in re-prompts. Unauthenticated by design:
/// it only ever *reduces* the token's privilege.
pub async fn relock(State(state): State<SharedState>, Json(body): Json<RelockBody>) -> Response {
    let token = body.access_token.trim().to_string();
    if !token.is_empty() {
        let _ = query(&state.db, move |pool| {
            db::set_access_pin_verified(&pool, &token, false)
        })
        .await;
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
pub struct ExchangeBody {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(default)]
    pub pin: Option<String>,
}

/// `POST /api/auth/token` `{ accessToken, pin? }` → `{ token, user }`. A PIN-locked
/// account whose token isn't PIN-verified must supply `pin`; a correct one marks
/// the token verified until the profile is switched away.
pub async fn exchange_token(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    Json(body): Json<ExchangeBody>,
) -> Response {
    let access = body.access_token.trim().to_string();
    if access.is_empty() {
        return token_invalid(loc);
    }
    let lookup = access.clone();
    let (user, pin_verified) =
        match query(&state.db, move |pool| db::access_token_user(&pool, &lookup)).await {
            Ok(Some(v)) => v,
            Ok(None) => return token_invalid(loc),
            Err(resp) => return resp,
        };

    if user.has_pin && !pin_verified {
        if let Err(resp) = enforce_pin_gate(&state, loc, &user, &access, body.pin.as_deref()).await
        {
            return resp;
        }
    }

    // Also refreshes the device's label: the UA captured at sign-in may be unnameable.
    let uid = user.id.clone();
    let ua = user_agent(&headers);
    let seen = access.clone();
    let _ = query(&state.db, move |pool| {
        let _ = db::touch_last_seen(&pool, &uid);
        let _ = db::touch_access_token(&pool, &seen, ua.as_deref());
        Ok(())
    })
    .await;
    let token = auth::random_token();
    let expires_at = time::OffsetDateTime::now_utc().unix_timestamp() + auth::SESSION_TTL_SECS;
    let token_db = token.clone();
    let uid = user.id.clone();
    let sess_access = access.clone();
    if let Err(resp) = query(&state.db, move |pool| {
        db::create_session(&pool, &token_db, &uid, expires_at, Some(&sess_access))
    })
    .await
    {
        return resp;
    }
    Json(crate::api::dto::SessionResult { token, user }).into_response()
}

async fn enforce_pin_gate(
    state: &SharedState,
    loc: &str,
    user: &User,
    access: &str,
    supplied_pin: Option<&str>,
) -> Result<(), Response> {
    if let Some(secs) = pin::lock_remaining(&user.id) {
        return Err(pin::locked_response(loc, secs));
    }
    let stored = pin::fetch_hash(state, &user.id).await?;
    match (supplied_pin, stored.as_deref()) {
        // No PIN hash on record → nothing to gate (treat as verified).
        (_, None) => {}
        // No PIN supplied is a silent refresh, not a wrong attempt: ask for it
        // without counting a failure, so background refreshes can't trip the
        // brute-force lockout.
        (None, Some(_)) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(
                    json!({ "error": i18n::t(loc, "auth.pinRequired", &[]), "pinRequired": true }),
                ),
            )
                .into_response());
        }
        (Some(pin), Some(hash)) => {
            if !auth::verify_password(pin, hash) {
                let locked = pin::record_fail(&user.id);
                if locked > 0 {
                    return Err(pin::locked_response(loc, locked));
                }
                return Err(lerr(loc, StatusCode::UNAUTHORIZED, "auth.pinIncorrect"));
            }
        }
    }
    pin::reset(&user.id);
    let tok = access.to_string();
    let _ = query(&state.db, move |pool| {
        db::set_access_pin_verified(&pool, &tok, true)
    })
    .await;
    Ok(())
}

/// `GET /api/auth/me/sessions` (Bearer) → `SessionInfo[]`. The account's live
/// signed-in devices, newest first, with the calling device flagged `current`.
pub async fn list_sessions(
    State(state): State<SharedState>,
    AuthToken(bearer): AuthToken,
    AuthUser(user): AuthUser,
) -> Response {
    let uid = user.id.clone();
    let rows = match query(&state.db, move |pool| db::list_access_tokens(&pool, &uid)).await {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    let current_id = match query(&state.db, move |pool| db::session_device_id(&pool, &bearer)).await
    {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let out: Vec<crate::api::dto::SessionInfo> = rows
        .into_iter()
        .map(|r| crate::api::dto::SessionInfo {
            current: current_id.as_deref() == Some(r.id.as_str()),
            id: r.id,
            user_agent: r.user_agent,
            created_at: r.created_at,
            last_seen: r.last_seen,
        })
        .collect();
    Json(out).into_response()
}

/// `DELETE /api/auth/me/sessions/:id` (Bearer) → 204. Revokes one of the account's
/// own devices by its non-secret id. `404` if the id isn't one of the caller's.
pub async fn revoke_session(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| {
        db::delete_access_token_by_id(&pool, &uid, &id)
    })
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => lerr(loc, StatusCode::NOT_FOUND, "auth.sessionNotFound"),
        Err(resp) => resp,
    }
}

pub(in crate::api) async fn mint_device_tokens(
    state: &SharedState,
    user_id: &str,
    user_agent: Option<String>,
) -> Result<(String, String), Response> {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();

    let access = auth::random_token();
    let access_db = access.clone();
    let uid = user_id.to_string();
    let access_exp = now + auth::ACCESS_TTL_SECS;
    let ua = user_agent;
    if let Err(resp) = query(&state.db, move |pool| {
        db::create_access_token(&pool, &access_db, &uid, access_exp, true, ua.as_deref())
    })
    .await
    {
        return Err(resp);
    }

    let token = auth::random_token();
    let token_db = token.clone();
    let uid = user_id.to_string();
    let session_exp = now + auth::SESSION_TTL_SECS;
    let sess_access = access.clone();
    if let Err(resp) = query(&state.db, move |pool| {
        db::create_session(&pool, &token_db, &uid, session_exp, Some(&sess_access))
    })
    .await
    {
        return Err(resp);
    }

    Ok((token, access))
}

/// Mints the token pair for a freshly authenticated `user`. The access token is
/// PIN-verified at birth: password auth already proved identity, so silent
/// refreshes work until the profile is switched away and re-locked.
pub(crate) async fn issue_tokens(
    state: SharedState,
    user: User,
    user_agent: Option<String>,
) -> Response {
    let (token, access) = match mint_device_tokens(&state, &user.id, user_agent).await {
        Ok(pair) => pair,
        Err(resp) => return resp,
    };

    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| {
        let _ = db::touch_last_seen(&pool, &uid);
        Ok(())
    })
    .await;
    Json(crate::api::dto::AuthResult {
        token,
        access_token: access,
        user,
    })
    .into_response()
}
