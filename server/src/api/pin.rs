//! Profile PIN handlers + brute-force lockout.
//!
//! An optional per-account PIN that locks a remembered profile on a shared TV. It
//! is **not** the credential (the bearer token from Quick Connect already grants
//! access) it only gates the local switch-in UX. Hashed with the same PBKDF2 as
//! passwords (its own random salt); the plaintext is never stored or logged.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::util::query;
use crate::api::extract::AuthUser;
use crate::services::auth;
use crate::db;
use crate::i18n::{self, ReqLocale};
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

// In-memory brute-force guard for `/auth/pin/verify`, keyed by user id: after
// `PIN_MAX_FAILS` wrong tries, locks out for a fixed cooldown. Process-local
// (resets on restart) is fine here since the bearer token remains the real
// credential; the PIN only gates the local profile switch-in UX.
struct PinAttempt {
    fails: u32,
    locked_until: i64,
}
const PIN_MAX_FAILS: u32 = 5;
const PIN_COOLDOWN_SECS: i64 = 30;
static PIN_ATTEMPTS: LazyLock<Mutex<HashMap<String, PinAttempt>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn now_secs() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn pin_lock_remaining(uid: &str) -> Option<i64> {
    let map = PIN_ATTEMPTS.lock().ok()?;
    let rem = map.get(uid)?.locked_until - now_secs();
    (rem > 0).then_some(rem)
}

// Returns the lockout window in seconds (0 = none yet).
fn pin_record_fail(uid: &str) -> i64 {
    let Ok(mut map) = PIN_ATTEMPTS.lock() else {
        return 0;
    };
    let a = map.entry(uid.to_string()).or_insert(PinAttempt { fails: 0, locked_until: 0 });
    a.fails += 1;
    if a.fails >= PIN_MAX_FAILS {
        // Fixed cooldown after N consecutive wrong PINs (no escalating backoff).
        a.locked_until = now_secs() + PIN_COOLDOWN_SECS;
        return PIN_COOLDOWN_SECS;
    }
    0
}

fn pin_reset(uid: &str) {
    if let Ok(mut map) = PIN_ATTEMPTS.lock() {
        map.remove(uid);
    }
}

fn pin_locked_response(loc: &str, secs: i64) -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({ "error": i18n::t(loc, "auth.pinLocked", &[]), "retryAfter": secs })),
    )
        .into_response()
}

async fn fetch_pin_hash(state: &SharedState, uid: &str) -> Result<Option<String>, Response> {
    let uid = uid.to_string();
    match query(&state.db, move |pool| db::user_pin_hash(&pool, &uid)).await {
        Ok(h) => Ok(h),
        Err(resp) => Err(resp),
    }
}

fn check_current_pin(existing: &Option<String>, current: Option<&str>, loc: &str) -> Result<(), Response> {
    if let Some(hash) = existing {
        if !current.is_some_and(|c| auth::verify_password(c, hash)) {
            return Err(lerr(loc, StatusCode::UNAUTHORIZED, "auth.pinCurrentWrong"));
        }
    }
    Ok(())
}

// Thin `pub(crate)` aliases so the token-exchange handler (`api::accounts`) can
// reuse this module's PIN lockout guard + hash lookup without duplicating them.
pub(crate) fn lock_remaining(uid: &str) -> Option<i64> {
    pin_lock_remaining(uid)
}
pub(crate) fn record_fail(uid: &str) -> i64 {
    pin_record_fail(uid)
}
pub(crate) fn reset(uid: &str) {
    pin_reset(uid);
}
pub(crate) fn locked_response(loc: &str, secs: i64) -> Response {
    pin_locked_response(loc, secs)
}
pub(crate) async fn fetch_hash(state: &SharedState, uid: &str) -> Result<Option<String>, Response> {
    fetch_pin_hash(state, uid).await
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
    if let Some(secs) = pin_lock_remaining(&user.id) {
        return pin_locked_response(loc, secs);
    }
    let stored = match fetch_pin_hash(&state, &user.id).await {
        Ok(h) => h,
        Err(resp) => return resp,
    };
    // No PIN set → nothing to gate; succeed so a PIN cleared elsewhere never
    // strands a profile the TV still thinks is locked.
    let Some(hash) = stored else {
        pin_reset(&user.id);
        return StatusCode::NO_CONTENT.into_response();
    };
    if auth::verify_password(&body.pin, &hash) {
        pin_reset(&user.id);
        StatusCode::NO_CONTENT.into_response()
    } else {
        let locked = pin_record_fail(&user.id);
        if locked > 0 {
            pin_locked_response(loc, locked)
        } else {
            lerr(loc, StatusCode::UNAUTHORIZED, "auth.pinIncorrect")
        }
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
    let existing = match fetch_pin_hash(&state, &user.id).await {
        Ok(h) => h,
        Err(resp) => return resp,
    };
    if let Err(resp) = check_current_pin(&existing, body.current.as_deref(), loc) {
        return resp;
    }
    let hash = auth::hash_password(&body.pin);
    let uid = user.id.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_pin(&pool, &uid, Some(&hash))).await {
        return resp;
    }
    // Re-lock every remembered device: the new PIN must be re-confirmed on the
    // next switch-in (their access tokens lose their pin-verified flag).
    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| db::reset_access_pin_verified(&pool, &uid)).await;
    pin_reset(&user.id);
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
    let existing = match fetch_pin_hash(&state, &user.id).await {
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
        pin_reset(&user.id);
    }
    user.has_pin = false;
    Json(json!({ "user": user })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_cooldown_after_max_fails_then_reset() {
        // Unique uid so the process-global attempt map can't collide with peers.
        let uid = "test-pin-fixed-cooldown";
        pin_reset(uid);
        for _ in 0..PIN_MAX_FAILS - 1 {
            assert_eq!(pin_record_fail(uid), 0);
        }
        assert_eq!(pin_record_fail(uid), PIN_COOLDOWN_SECS);
        let rem = pin_lock_remaining(uid).expect("should be locked");
        assert!(rem > 0 && rem <= PIN_COOLDOWN_SECS);
        pin_reset(uid);
        assert!(pin_lock_remaining(uid).is_none());
    }
}
