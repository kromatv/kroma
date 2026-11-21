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
use crate::model::User;
use crate::services::auth;
use crate::services::loginguard;
use crate::state::SharedState;

use super::waiting::{claim, invited_account, Joining};
use super::{issue_tokens, ThisDevice};

pub(crate) const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "inviteToken", default)]
    pub invite_token: Option<String>,
}

/// `POST /api/auth/register` → `{ token, user }`. The first account ever created is
/// the owner, granted in the insert itself so that two registrations in flight
/// against an empty server cannot both claim it; after that a valid `inviteToken`
/// is required and grants its permissions. The invitation of an account that
/// waits creates nobody: that account takes the password, the name and the
/// address sent here, and keeps its id (ACCT-96 to ACCT-98). The owner can only
/// be claimed from a loopback or private address, so a server exposed before
/// first run is not handed to whoever reaches it first.
pub async fn register(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ThisDevice(device): ThisDevice,
    headers: HeaderMap,
    Json(body): Json<RegisterBody>,
) -> Response {
    let Some(who) = registrant(&body) else {
        return lerr(loc, StatusCode::BAD_REQUEST, "auth.registerInvalid");
    };

    let count = match query(&state.db, move |pool| db::user_count(&pool)).await {
        Ok(n) => n,
        Err(resp) => return resp,
    };

    if count > 0 {
        if let Err(resp) = invite_open(&state, loc, body.invite_token.clone()).await {
            return resp;
        }
    }

    let waiting = match invited_account(&state, body.invite_token.as_deref()).await {
        Ok(account) => account,
        Err(resp) => return resp,
    };

    // Reject a duplicate email before consuming any invite, or a retry spends the
    // single-use invite. `create_user`'s UNIQUE constraint is the atomic backstop.
    // Same for the username, and before the invite too: a duplicate would make
    // username login ambiguous.
    let names = NameCheck {
        email: who.email.clone(),
        username: who.username.clone(),
        own: waiting.clone(),
    };
    if let Err(resp) = names_free(&state, loc, names).await {
        return resp;
    }

    if count == 0 {
        if !from_lan(&state, &headers, &addr) {
            return lerr(loc, StatusCode::FORBIDDEN, "auth.firstRunLocalOnly");
        }
        match create_owner(&state, &who).await {
            Ok(Some(owner)) => return issue_tokens(state, owner, device.clone()).await,
            Ok(None) => {}
            Err(resp) => return resp,
        }
    }

    let Some(token) = body.invite_token.clone().filter(|t| !t.trim().is_empty()) else {
        return lerr(loc, StatusCode::FORBIDDEN, "auth.inviteOnly");
    };
    let joining = Joining {
        token,
        email: who.email,
        username: who.username,
        password: who.password,
    };
    if waiting.is_some() {
        return claim(state, loc, device, joining).await;
    }
    match invited_user(&state, loc, joining).await {
        Ok(user) => issue_tokens(state, user, device.clone()).await,
        Err(resp) => resp,
    }
}

struct Registrant {
    email: String,
    username: String,
    password: String,
}

fn registrant(body: &RegisterBody) -> Option<Registrant> {
    let email = body.email.trim().to_lowercase();
    let username = body.username.trim().to_string();
    let valid =
        email.contains('@') && !username.is_empty() && body.password.len() >= MIN_PASSWORD_LEN;
    valid.then(|| Registrant {
        email,
        username,
        password: body.password.clone(),
    })
}

async fn invite_open(
    state: &SharedState,
    loc: &'static str,
    token: Option<String>,
) -> Result<(), Response> {
    if !crate::api::sso::sign_in_config(state).password() {
        return Err(lerr(loc, StatusCode::FORBIDDEN, "sso.passwordOff"));
    }
    let Some(token) = token.filter(|t| !t.trim().is_empty()) else {
        return Err(lerr(loc, StatusCode::FORBIDDEN, "auth.inviteOnly"));
    };
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    match query(&state.db, move |pool| db::get_invite(&pool, token.trim())).await? {
        Some(invite) if !invite.used && invite.expires_at > now => Ok(()),
        _ => Err(lerr(loc, StatusCode::FORBIDDEN, "auth.inviteInvalid")),
    }
}

struct NameCheck {
    email: String,
    username: String,
    own: Option<String>,
}

async fn names_free(
    state: &SharedState,
    loc: &'static str,
    check: NameCheck,
) -> Result<(), Response> {
    let NameCheck {
        email,
        username,
        own,
    } = check;
    let mine = own.clone();
    if query(&state.db, move |pool| {
        db::email_taken(&pool, &email, mine.as_deref())
    })
    .await?
    {
        return Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"));
    }
    if query(&state.db, move |pool| {
        db::username_taken(&pool, &username, own.as_deref())
    })
    .await?
    {
        return Err(lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken"));
    }
    Ok(())
}

fn from_lan(state: &SharedState, headers: &HeaderMap, addr: &SocketAddr) -> bool {
    let ip = client_ip(headers, addr, &state.config.trusted_proxies);
    crate::services::playback::is_lan(
        &ip,
        &crate::services::settings::local_networks(&state.settings),
    )
}

async fn create_owner(state: &SharedState, who: &Registrant) -> Result<Option<User>, Response> {
    let hash = auth::hash_password(&who.password);
    let (email, username) = (who.email.clone(), who.username.clone());
    query(&state.db, move |pool| {
        let owner = db::create_owner_if_first(&pool, &email, &username, &hash)?;
        if let Some(owner) = &owner {
            db::set_whats_new_seen(&pool, &owner.id, crate::VERSION)?;
            db::setup::lead_setup(&pool, &owner.id)?;
        }
        Ok(owner)
    })
    .await
}

async fn invited_user(
    state: &SharedState,
    loc: &'static str,
    joining: Joining,
) -> Result<User, Response> {
    let token = joining.token.clone();
    let permissions = query(&state.db, move |pool| {
        db::consume_invite(&pool, token.trim())
    })
    .await?
    .ok_or_else(|| lerr(loc, StatusCode::FORBIDDEN, "auth.inviteInvalid"))?;
    let hash = auth::hash_password(&joining.password);
    query(&state.db, move |pool| {
        let user = db::create_user(
            &pool,
            &joining.email,
            &joining.username,
            &hash,
            &permissions,
        )?;
        db::set_whats_new_seen(&pool, &user.id, crate::VERSION)?;
        Ok(user)
    })
    .await
}

#[derive(Debug, Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

fn dummy_hash() -> &'static str {
    static DUMMY: std::sync::LazyLock<String> =
        std::sync::LazyLock::new(|| auth::hash_password("timing-equaliser-not-a-real-secret"));
    &DUMMY
}

/// `POST /api/auth/login` → `{ token, user }`. Accepts email or username.
/// Brute-force guarded per source IP (see [`loginguard`]): consecutive failures
/// lock the IP out for an escalating cooldown, answered `429` with a `retryAfter`.
pub async fn login(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ThisDevice(device): ThisDevice,
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
    // Same response, and the same cost, whether the account is unknown or the
    // password is wrong: verify against a fixed hash on the miss path so the
    // reply time does not say which accounts exist.
    let Some((user, hash)) = found else {
        let _ = auth::verify_password(&body.password, dummy_hash());
        return login_failed(&ip, loc);
    };
    if !auth::verify_password(&body.password, &hash) {
        return login_failed(&ip, loc);
    }
    loginguard::reset(&ip);
    if !password_admits(&state, &user) {
        return lerr(loc, StatusCode::FORBIDDEN, "sso.passwordOff");
    }
    issue_tokens(state, user, device.clone()).await
}

// Whoever can change the sign-in settings keeps their password whatever those
// settings say, so a provider that is down never locks the server.
fn password_admits(state: &SharedState, user: &crate::model::User) -> bool {
    crate::api::sso::sign_in_config(state).password()
        || user
            .permissions
            .contains(&crate::model::Permission::SettingsManage)
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
