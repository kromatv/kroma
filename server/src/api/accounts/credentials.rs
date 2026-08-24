//! Password credentials: registration, sign-in and the password change.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::extract::{AuthToken, AuthUser};
use crate::api::util::{client_ip, query};
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::Permission;
use crate::services::auth;
use crate::services::loginguard;
use crate::state::SharedState;

use super::{issue_tokens, user_agent};

const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "inviteToken", default)]
    pub invite_token: Option<String>,
}

/// `POST /api/auth/register` → `{ token, user }`. The first account ever created is
/// the owner; after that a valid `inviteToken` is required and grants its permissions.
pub async fn register(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    Json(body): Json<RegisterBody>,
) -> Response {
    let email = body.email.trim().to_lowercase();
    let username = body.username.trim().to_string();
    if email.is_empty()
        || !email.contains('@')
        || username.is_empty()
        || body.password.len() < MIN_PASSWORD_LEN
    {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.registerInvalid");
    }

    let count = match query(&state.db, move |pool| db::user_count(&pool)).await {
        Ok(n) => n,
        Err(resp) => return resp,
    };

    // Reject a duplicate email before consuming any invite, or a retry spends the
    // single-use invite. `create_user`'s UNIQUE constraint is the atomic backstop.
    let email_check = email.clone();
    match query(&state.db, move |pool| {
        db::find_user_by_email(&pool, &email_check)
    })
    .await
    {
        Ok(Some(_)) => return lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"),
        Ok(None) => {}
        Err(resp) => return resp,
    }

    // Same for the username, and before the invite too: a duplicate would make
    // username login ambiguous.
    let username_check = username.clone();
    match query(&state.db, move |pool| {
        db::username_taken(&pool, &username_check, None)
    })
    .await
    {
        Ok(true) => return lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken"),
        Ok(false) => {}
        Err(resp) => return resp,
    }

    let permissions = if count == 0 {
        Permission::all()
    } else {
        let Some(token) = body.invite_token.clone().filter(|t| !t.trim().is_empty()) else {
            return lerr(loc, StatusCode::FORBIDDEN, "auth.inviteOnly");
        };
        match query(&state.db, move |pool| {
            db::consume_invite(&pool, token.trim())
        })
        .await
        {
            Ok(Some(perms)) => perms,
            Ok(None) => return lerr(loc, StatusCode::FORBIDDEN, "auth.inviteInvalid"),
            Err(resp) => return resp,
        }
    };

    let hash = auth::hash_password(&body.password);
    let user = match query(&state.db, move |pool| {
        db::create_user(&pool, &email, &username, &hash, &permissions)
    })
    .await
    {
        Ok(u) => u,
        Err(resp) => return resp,
    };
    issue_tokens(state, user, user_agent(&headers)).await
}

#[derive(Debug, Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

/// `POST /api/auth/login` → `{ token, user }`. Accepts email or username.
/// Brute-force guarded per source IP (see [`loginguard`]): consecutive failures
/// lock the IP out for an escalating cooldown, answered `429` with a `retryAfter`.
pub async fn login(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Response {
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    // Reject while locked out before touching the database or hashing.
    if let Some(secs) = loginguard::lock_remaining(&ip) {
        return login_locked(loc, secs);
    }

    let identifier = body.email.trim().to_string();
    let found = match query(&state.db, move |pool| {
        db::find_user_by_login(&pool, &identifier)
    })
    .await
    {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    // Same response whether the email is unknown or the password is wrong.
    let Some((user, hash)) = found else {
        return login_failed(&ip, loc);
    };
    if !auth::verify_password(&body.password, &hash) {
        return login_failed(&ip, loc);
    }
    loginguard::reset(&ip);
    issue_tokens(state, user, user_agent(&headers)).await
}

fn login_failed(ip: &str, loc: &str) -> Response {
    let locked = loginguard::record_fail(ip);
    if locked > 0 {
        login_locked(loc, locked)
    } else {
        lerr(loc, StatusCode::UNAUTHORIZED, "auth.invalidCredentials")
    }
}

fn login_locked(loc: &str, secs: i64) -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({ "error": i18n::t(loc, "auth.loginLocked", &[]), "retryAfter": secs })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordBody {
    pub current: String,
    pub next: String,
}

/// `PATCH /api/auth/me/password` (Bearer) `{ current, next }` → 204. Every other
/// session and device token is revoked (a rotation is how a user evicts a stolen
/// credential) while the caller's own session keeps working.
pub async fn change_password(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthToken(keep): AuthToken,
    AuthUser(user): AuthUser,
    Json(body): Json<ChangePasswordBody>,
) -> Response {
    if body.next.len() < MIN_PASSWORD_LEN {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.passwordTooShort");
    }
    let uid = user.id.clone();
    let stored = match query(&state.db, move |pool| db::user_password_hash(&pool, &uid)).await {
        Ok(Some(h)) => h,
        Ok(None) => return lerr(loc, StatusCode::NOT_FOUND, "auth.invalidCredentials"),
        Err(resp) => return resp,
    };
    if !auth::verify_password(&body.current, &stored) {
        return lerr(loc, StatusCode::UNAUTHORIZED, "auth.passwordCurrentWrong");
    }
    let hash = auth::hash_password(&body.next);
    let uid = user.id.clone();
    if let Err(resp) = query(&state.db, move |pool| {
        db::set_user_password(&pool, &uid, &hash)
    })
    .await
    {
        return resp;
    }
    // Best-effort: failing to evict the other credentials must not fail the change.
    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| {
        db::revoke_other_sessions(&pool, &uid, &keep)
    })
    .await;
    StatusCode::NO_CONTENT.into_response()
}
