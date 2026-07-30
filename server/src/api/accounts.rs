//! Accounts, sessions, profile avatar/language, and Quick Connect handlers.
//! Catalogue/stream endpoints stay open (LAN trust model); only these per-user
//! routes require a valid session via the [`AuthUser`] extractor.

use std::net::SocketAddr;

use axum::body::Bytes;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::pin;
use crate::api::util::{blocking, client_ip, query};
use crate::api::extract::{bearer_from_headers, AuthUser};
use crate::services::auth;
use crate::services::loginguard;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::{Permission, PublicUser, User};
use crate::services::quickconnect::PollState;
use crate::state::SharedState;
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, patch, post};
use axum::Router;

/// PIN routes live in [`super::pin`]; invitations in [`super::invites`].
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/config", get(auth_config))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/token", post(exchange_token))
        .route("/auth/relock", post(relock))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me).patch(update_me))
        .route("/auth/me/password", patch(change_password))
        .route("/auth/me/sessions", get(list_sessions))
        .route("/auth/me/sessions/{id}", axum::routing::delete(revoke_session))
        .route("/auth/quickconnect/initiate", post(quick_initiate))
        .route("/auth/quickconnect/authorize", post(quick_authorize))
        .route("/auth/quickconnect/poll", get(quick_poll))
        .route("/users", get(list_users))
        .route(
            "/users/avatar",
            post(upload_avatar).layer(DefaultBodyLimit::max(MAX_AVATAR_BYTES)),
        )
}

const AVATAR_MAX_WIDTH: u32 = 512;

pub const MAX_AVATAR_BYTES: usize = 8 * 1024 * 1024;

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
    match query(&state.db, move |pool| db::find_user_by_email(&pool, &email_check)).await {
        Ok(Some(_)) => return lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"),
        Ok(None) => {}
        Err(resp) => return resp,
    }

    // Same for the username, and before the invite too: a duplicate would make
    // username login ambiguous.
    let username_check = username.clone();
    match query(&state.db, move |pool| db::username_taken(&pool, &username_check, None)).await {
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
        match query(&state.db, move |pool| db::consume_invite(&pool, token.trim())).await {
            Ok(Some(perms)) => perms,
            Ok(None) => return lerr(loc, StatusCode::FORBIDDEN, "auth.inviteInvalid"),
            Err(resp) => return resp,
        }
    };

    let hash = auth::hash_password(&body.password);
    let user =
        match query(&state.db, move |pool| db::create_user(&pool, &email, &username, &hash, &permissions)).await
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
    let ip = client_ip(&headers, &addr);
    // Reject while locked out before touching the database or hashing.
    if let Some(secs) = loginguard::lock_remaining(&ip) {
        return login_locked(loc, secs);
    }

    let identifier = body.email.trim().to_string();
    let found = match query(&state.db, move |pool| db::find_user_by_login(&pool, &identifier)).await {
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

pub(crate) fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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
    if let Some(access) = body.and_then(|b| b.0.access_token).filter(|t| !t.is_empty()) {
        let _ = query(&state.db, move |pool| db::delete_access_token(&pool, &access)).await;
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
        let _ = query(&state.db, move |pool| db::set_access_pin_verified(&pool, &token, false)).await;
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
    let (user, pin_verified) = match query(&state.db, move |pool| db::access_token_user(&pool, &lookup)).await {
        Ok(Some(v)) => v,
        Ok(None) => return token_invalid(loc),
        Err(resp) => return resp,
    };

    if user.has_pin && !pin_verified {
        if let Err(resp) = enforce_pin_gate(&state, loc, &user, &access, body.pin.as_deref()).await {
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
    Json(super::dto::SessionResult { token, user }).into_response()
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
                Json(json!({ "error": i18n::t(loc, "auth.pinRequired", &[]), "pinRequired": true })),
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
    let _ = query(&state.db, move |pool| db::set_access_pin_verified(&pool, &tok, true)).await;
    Ok(())
}

/// `GET /api/auth/config` → `{ publicUserList, hasAccounts }`. Unauthenticated: the
/// login gate reads it before any credential to choose between register, the
/// profile picker, and a plain email/password form.
pub async fn auth_config(State(state): State<SharedState>) -> Response {
    let has_accounts = match query(&state.db, move |pool| db::user_count(&pool)).await {
        Ok(n) => n > 0,
        // Fail closed: assume the server is set up, so registration stays hidden.
        Err(_) => true,
    };
    Json(super::dto::AuthConfig {
        public_user_list: state.settings.get_bool("publicUserList", false),
        has_accounts,
    })
    .into_response()
}

pub async fn me(AuthUser(user): AuthUser) -> Response {
    Json(json!({ "user": user })).into_response()
}

// Distinguishes an absent field (leave unchanged) from an explicit `null` (clear
// it), so `PATCH /auth/me` touches only the fields the client actually sent.
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

#[derive(Debug, Deserialize)]
pub struct UpdateMeBody {
    #[serde(default, deserialize_with = "double_option")]
    pub language: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub username: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub email: Option<Option<String>>,
    #[serde(rename = "audioLanguage", default, deserialize_with = "double_option")]
    pub audio_language: Option<Option<String>>,
    #[serde(rename = "subtitleLanguage", default, deserialize_with = "double_option")]
    pub subtitle_language: Option<Option<String>>,
}

// Media languages are free-form ISO codes, so unlike the UI `language` they are
// not constrained to the app's catalog.
fn norm_media_lang(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty())
}

/// `PATCH /api/auth/me` (Bearer) → `{ user }`. Only the fields present in the body
/// are touched; all persist server-side so they follow the account across devices.
pub async fn update_me(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(mut user): AuthUser,
    Json(body): Json<UpdateMeBody>,
) -> Response {
    if let Err(resp) = apply_username(&state, loc, &mut user, body.username).await {
        return resp;
    }
    if let Err(resp) = apply_email(&state, loc, &mut user, body.email).await {
        return resp;
    }
    if let Err(resp) = apply_language(&state, &mut user, body.language).await {
        return resp;
    }
    if let Err(resp) = apply_audio_language(&state, &mut user, body.audio_language).await {
        return resp;
    }
    if let Err(resp) = apply_subtitle_language(&state, &mut user, body.subtitle_language).await {
        return resp;
    }
    Json(json!({ "user": user })).into_response()
}

async fn apply_username(
    state: &SharedState,
    loc: &str,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(name) = field else { return Ok(()) };
    let name = name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "auth.usernameInvalid"));
    }
    let check = name.clone();
    let self_id = user.id.clone();
    match query(&state.db, move |pool| db::username_taken(&pool, &check, Some(&self_id))).await {
        Ok(true) => return Err(lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken")),
        Ok(false) => {}
        Err(resp) => return Err(resp),
    }
    let uid = user.id.clone();
    let n = name.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_username(&pool, &uid, &n)).await {
        return Err(resp);
    }
    user.username = name;
    Ok(())
}

async fn apply_email(
    state: &SharedState,
    loc: &str,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(email) = field else { return Ok(()) };
    let email = email.unwrap_or_default().trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "auth.emailInvalid"));
    }
    let check = email.clone();
    match query(&state.db, move |pool| db::find_user_by_email(&pool, &check)).await {
        Ok(Some((other, _))) if other.id != user.id => {
            return Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"));
        }
        Ok(_) => {}
        Err(resp) => return Err(resp),
    }
    let uid = user.id.clone();
    let e = email.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_email(&pool, &uid, &e)).await {
        // A concurrent request can take the address between the check and the
        // write; re-confirm so the UNIQUE(email) failure surfaces as 409, not 500.
        let check = email.clone();
        let self_id = user.id.clone();
        if let Ok(Some((other, _))) =
            query(&state.db, move |pool| db::find_user_by_email(&pool, &check)).await
        {
            if other.id != self_id {
                return Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"));
            }
        }
        return Err(resp);
    }
    user.email = email;
    Ok(())
}

async fn store_user_lang<F>(
    state: &SharedState,
    user_id: &str,
    value: Option<String>,
    set: F,
) -> Result<Option<String>, Response>
where
    F: FnOnce(&db::Pool, &str, Option<&str>) -> anyhow::Result<()> + Send + 'static,
{
    let uid = user_id.to_string();
    let v = value.clone();
    query(&state.db, move |pool| set(&pool, &uid, v.as_deref())).await?;
    Ok(value)
}

async fn apply_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(lang) = field else { return Ok(()) };
    let language = lang.and_then(|tag| i18n::normalize(&tag)).map(|c| c.to_string());
    user.language = store_user_lang(state, &user.id, language, db::set_user_language).await?;
    Ok(())
}

async fn apply_audio_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(audio) = field else { return Ok(()) };
    let audio = norm_media_lang(audio);
    user.audio_language = store_user_lang(state, &user.id, audio, db::set_user_audio_language).await?;
    Ok(())
}

async fn apply_subtitle_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(sub) = field else { return Ok(()) };
    let sub = norm_media_lang(sub);
    user.subtitle_language = store_user_lang(state, &user.id, sub, db::set_user_subtitle_language).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordBody {
    pub current: String,
    pub next: String,
}

/// `PATCH /api/auth/me/password` (Bearer) `{ current, next }` → 204. Every other
/// session and device token is revoked — a rotation is how a user evicts a stolen
/// credential — while the caller's own session keeps working.
pub async fn change_password(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
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
    if let Err(resp) = query(&state.db, move |pool| db::set_user_password(&pool, &uid, &hash)).await {
        return resp;
    }
    // Best-effort: failing to evict the other credentials must not fail the change.
    if let Some(keep) = bearer_from_headers(&headers) {
        let uid = user.id.clone();
        let _ = query(&state.db, move |pool| db::revoke_other_sessions(&pool, &uid, &keep)).await;
    }
    StatusCode::NO_CONTENT.into_response()
}

/// `GET /api/auth/me/sessions` (Bearer) → `SessionInfo[]`. The account's live
/// signed-in devices, newest first, with the calling device flagged `current`.
pub async fn list_sessions(
    State(state): State<SharedState>,
    headers: HeaderMap,
    AuthUser(user): AuthUser,
) -> Response {
    let uid = user.id.clone();
    let rows = match query(&state.db, move |pool| db::list_access_tokens(&pool, &uid)).await {
        Ok(r) => r,
        Err(resp) => return resp,
    };
    let current_id = match bearer_from_headers(&headers) {
        Some(bearer) => {
            match query(&state.db, move |pool| db::session_device_id(&pool, &bearer)).await {
                Ok(id) => id,
                Err(resp) => return resp,
            }
        }
        None => None,
    };
    let out: Vec<super::dto::SessionInfo> = rows
        .into_iter()
        .map(|r| super::dto::SessionInfo {
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
    match query(&state.db, move |pool| db::delete_access_token_by_id(&pool, &uid, &id)).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => lerr(loc, StatusCode::NOT_FOUND, "auth.sessionNotFound"),
        Err(resp) => resp,
    }
}

async fn mint_device_tokens(
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
pub(crate) async fn issue_tokens(state: SharedState, user: User, user_agent: Option<String>) -> Response {
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
    Json(super::dto::AuthResult { token, access_token: access, user }).into_response()
}

/// `GET /api/users` → `PublicUser[]` for the profile picker. Gated by the
/// `publicUserList` setting (off by default): when disabled this returns an empty
/// list, so knowing the server URL never reveals who has an account.
pub async fn list_users(State(state): State<SharedState>) -> Response {
    if !state.settings.get_bool("publicUserList", false) {
        return Json(Vec::<PublicUser>::new()).into_response();
    }
    match query(&state.db, move |pool| db::list_users(&pool)).await {
        Ok(users) => Json(users).into_response(),
        Err(resp) => resp,
    }
}

/// `POST /api/users/avatar` (Bearer, body = raw `image/*`) → `{ avatarUrl }`.
pub async fn upload_avatar(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Response {
    if body.is_empty() {
        return lerr(loc, StatusCode::BAD_REQUEST, "error.emptyBody");
    }
    if body.len() > MAX_AVATAR_BYTES {
        return lerr(loc, StatusCode::PAYLOAD_TOO_LARGE, "error.imageTooLarge");
    }

    let data_dir = state.config.data_dir.clone();
    let bytes = body.to_vec();
    let url = match blocking(move || Ok(crate::infra::image::store_upload(&data_dir, &bytes, Some(AVATAR_MAX_WIDTH)))).await {
        Ok(Some(u)) => u,
        Ok(None) => return lerr(loc, StatusCode::UNSUPPORTED_MEDIA_TYPE, "error.imageUnreadable"),
        Err(resp) => return resp,
    };

    let uid = user.id.clone();
    let url_db = url.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_avatar(&pool, &uid, Some(&url_db))).await {
        return resp;
    }
    Json(json!({ "avatarUrl": url })).into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickInitiateBody {
    pub prev_secret: Option<String>,
}

/// `POST /api/auth/quickconnect/initiate` → `{ code, secret, expiresInSec,
/// authorizeUrl? }`. The device shows `code` and polls with `secret`; rotating an
/// expiring code sends the old secret as `prevSecret` so the server drops it.
pub async fn quick_initiate(
    State(state): State<SharedState>,
    body: Option<Json<QuickInitiateBody>>,
) -> Response {
    // Drop the rotated-away code so it stops being approvable, along with any
    // tokens it accrued in the gap (approved but never polled for).
    if let Some(Json(QuickInitiateBody { prev_secret: Some(secret) })) = body {
        if let Some(revoked) = state.quickconnect.revoke(&secret) {
            let (token, access) = (revoked.token, revoked.access_token);
            let _ = query(&state.db, move |pool| db::delete_session(&pool, &token)).await;
            let _ = query(&state.db, move |pool| db::delete_access_token(&pool, &access)).await;
        }
    }
    let init = state.quickconnect.initiate();
    let web_base = state.config.web_url.clone().or_else(|| {
        let url = crate::services::settings::public_url(&state.settings);
        (!url.is_empty()).then_some(url)
    });
    let authorize_url = web_base.map(|w| format!("{w}/connect?code={}", init.code));
    Json(super::dto::QuickConnectInit {
        code: init.code,
        secret: init.secret,
        expires_in_sec: init.expires_in,
        authorize_url,
    })
    .into_response()
}

#[derive(Debug, Deserialize)]
pub struct QuickAuthorizeBody {
    pub code: String,
}

/// `POST /api/auth/quickconnect/authorize` (Bearer) `{ code }` → 204. Approves a
/// device's code, minting the session it collects on its next poll.
pub async fn quick_authorize(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(body): Json<QuickAuthorizeBody>,
) -> Response {
    let code = body.code.trim().to_string();

    // PIN-verified: the approver is already signed in and vouches for the device.
    // That device isn't the caller, so its UA is unknown here (NULL) until use.
    let (token, access) = match mint_device_tokens(&state, &user.id, None).await {
        Ok(pair) => pair,
        Err(resp) => return resp,
    };

    if state.quickconnect.authorize(&code, user, token.clone(), access.clone()) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        // Unknown/expired code → don't leave the just-created tokens dangling.
        let _ = query(&state.db, move |pool| db::delete_session(&pool, &token)).await;
        let _ = query(&state.db, move |pool| db::delete_access_token(&pool, &access)).await;
        lerr(loc, StatusCode::NOT_FOUND, "connect.invalidCode")
    }
}

#[derive(Debug, Deserialize)]
pub struct QuickPollQuery {
    pub secret: String,
}

/// `GET /api/auth/quickconnect/poll?secret=…` → `{ status }` where status is
/// `pending` | `authorized` (then `{ token, user }`) | `expired`.
pub async fn quick_poll(State(state): State<SharedState>, Query(q): Query<QuickPollQuery>) -> Response {
    let status = match state.quickconnect.poll(&q.secret) {
        PollState::Authorized { token, access_token, user } => {
            super::dto::QuickPoll::Authorized { token, access_token, user }
        }
        PollState::Pending => super::dto::QuickPoll::Pending,
        PollState::Unknown => super::dto::QuickPoll::Expired,
    };
    Json(status).into_response()
}
