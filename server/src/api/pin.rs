//! Profile PIN handlers + brute-force lockout.
//!
//! An optional per-account PIN that locks a remembered profile on a shared TV. It
//! is **not** the credential (the bearer token from Quick Connect already grants
//! access) it only gates the local switch-in UX. Hashed with the same PBKDF2 as
//! passwords (its own random salt); the plaintext is never stored or logged.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::services::auth;
use crate::state::SharedState;
use axum::routing::{patch, post};
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/pin/verify", post(verify_pin))
        .route("/auth/me/pin", patch(set_pin).delete(delete_pin))
}

// Every client keypad enforces this length (auto-submit on the last digit).
const PIN_LEN: usize = 4;

// Entropy is intentionally low (a D-pad keypad); `verify_pin` rate-limits below
// to compensate.
fn is_valid_pin(pin: &str) -> bool {
    pin.len() == PIN_LEN && pin.bytes().all(|b| b.is_ascii_digit())
}

const PIN_MAX_FAILS: i64 = 5;
const PIN_COOLDOWN_SECS: i64 = 30;

fn now_secs() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// Seconds left on the account's cooldown, read from the row the guesses are
/// counted in rather than from this process's memory.
pub(crate) async fn lock_remaining(
    state: &SharedState,
    uid: &str,
) -> Result<Option<i64>, Response> {
    let uid = uid.to_string();
    let recorded = query(&state.db, move |pool| db::pin_attempts(&pool, &uid)).await?;
    let rem = recorded.locked_until - now_secs();
    Ok((rem > 0).then_some(rem))
}

/// Counts one wrong guess and answers with the cooldown window it earned, in
/// seconds (`0` = none yet). A fixed window once the count reaches
/// `PIN_MAX_FAILS`, with no escalating backoff.
pub(crate) async fn record_fail(state: &SharedState, uid: &str) -> Result<i64, Response> {
    let now = now_secs();
    let uid = uid.to_string();
    let recorded = query(&state.db, move |pool| {
        db::record_pin_fail(&pool, &uid, PIN_MAX_FAILS, now + PIN_COOLDOWN_SECS)
    })
    .await?;
    Ok((recorded.locked_until - now).max(0))
}

pub(crate) async fn reset(state: &SharedState, uid: &str) {
    let uid = uid.to_string();
    let _ = query(&state.db, move |pool| db::clear_pin_attempts(&pool, &uid)).await;
}

pub(crate) fn locked_response(loc: &str, secs: i64) -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({ "error": i18n::t(loc, "auth.pinLocked", &[]), "retryAfter": secs })),
    )
        .into_response()
}

pub(crate) async fn fetch_hash(state: &SharedState, uid: &str) -> Result<Option<String>, Response> {
    let uid = uid.to_string();
    match query(&state.db, move |pool| db::user_pin_hash(&pool, &uid)).await {
        Ok(h) => Ok(h),
        Err(resp) => Err(resp),
    }
}

fn check_current_pin(
    existing: &Option<String>,
    current: Option<&str>,
    loc: &str,
) -> Result<(), Response> {
    if let Some(hash) = existing {
        if !current.is_some_and(|c| auth::verify_password(c, hash)) {
            return Err(lerr(loc, StatusCode::UNAUTHORIZED, "auth.pinCurrentWrong"));
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct VerifyPinBody {
    pub pin: String,
}

/// `POST /api/auth/pin/verify` (Bearer) `{ pin }` → 204 on match, 401 on
/// mismatch, 429 while locked out. The TV holds the paired token and posts the
/// typed PIN before switching into a locked profile.
pub async fn verify_pin(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(body): Json<VerifyPinBody>,
) -> Response {
    match lock_remaining(&state, &user.id).await {
        Ok(Some(secs)) => return locked_response(loc, secs),
        Ok(None) => {}
        Err(resp) => return resp,
    }
    let stored = match fetch_hash(&state, &user.id).await {
        Ok(h) => h,
        Err(resp) => return resp,
    };
    // No PIN set → nothing to gate; succeed so a PIN cleared elsewhere never
    // strands a profile the TV still thinks is locked.
    let Some(hash) = stored else {
        reset(&state, &user.id).await;
        return StatusCode::NO_CONTENT.into_response();
    };
    if auth::verify_password(&body.pin, &hash) {
        reset(&state, &user.id).await;
        return StatusCode::NO_CONTENT.into_response();
    }
    match record_fail(&state, &user.id).await {
        Ok(0) => lerr(loc, StatusCode::UNAUTHORIZED, "auth.pinIncorrect"),
        Ok(secs) => locked_response(loc, secs),
        Err(resp) => resp,
    }
}

#[derive(Debug, Deserialize)]
pub struct SetPinBody {
    pub pin: String,
    #[serde(default)]
    pub current: Option<String>,
}

/// `PATCH /api/auth/me/pin` (Bearer) `{ pin, current? }` → `{ user }`. Sets or
/// rotates the caller's own PIN. Self-service, so web/mobile can manage it.
pub async fn set_pin(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(mut user): AuthUser,
    Json(body): Json<SetPinBody>,
) -> Response {
    if !is_valid_pin(&body.pin) {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.pinInvalid");
    }
    let existing = match fetch_hash(&state, &user.id).await {
        Ok(h) => h,
        Err(resp) => return resp,
    };
    if let Err(resp) = check_current_pin(&existing, body.current.as_deref(), loc) {
        return resp;
    }
    let hash = auth::hash_password(&body.pin);
    let uid = user.id.clone();
    if let Err(resp) = query(&state.db, move |pool| {
        db::set_user_pin(&pool, &uid, Some(&hash))
    })
    .await
    {
        return resp;
    }
    // Re-lock every remembered device: the new PIN must be re-confirmed on the
    // next switch-in (their access tokens lose their pin-verified flag).
    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| {
        db::reset_access_pin_verified(&pool, &uid)
    })
    .await;
    reset(&state, &user.id).await;
    user.has_pin = true;
    Json(json!({ "user": user })).into_response()
}

#[derive(Debug, Deserialize)]
pub struct DeletePinBody {
    pub current: String,
}

/// `DELETE /api/auth/me/pin` (Bearer) `{ current }` → `{ user }`. Clears the
/// caller's PIN after verifying the current one (idempotent when none is set).
pub async fn delete_pin(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(mut user): AuthUser,
    Json(body): Json<DeletePinBody>,
) -> Response {
    let existing = match fetch_hash(&state, &user.id).await {
        Ok(h) => h,
        Err(resp) => return resp,
    };
    if let Err(resp) = check_current_pin(&existing, Some(body.current.as_str()), loc) {
        return resp;
    }
    if existing.is_some() {
        let uid = user.id.clone();
        if let Err(resp) = query(&state.db, move |pool| db::set_user_pin(&pool, &uid, None)).await {
            return resp;
        }
        reset(&state, &user.id).await;
    }
    user.has_pin = false;
    Json(json!({ "user": user })).into_response()
}
