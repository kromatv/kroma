//! Accounts, sessions, profile avatar/language, and Quick Connect handlers.
//! Catalogue/stream endpoints stay open (LAN trust model); only these per-user
//! routes require a valid session via the [`AuthUser`] extractor.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::api::util::query;
use crate::api::extract::AuthUser;
use crate::db;
use crate::model::PublicUser;
use crate::state::SharedState;
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, patch, post};
use axum::Router;

mod credentials;
mod profile;
mod quick_connect;
mod session;

use credentials::{change_password, login, register};
use profile::{update_me, upload_avatar};
use quick_connect::{quick_authorize, quick_initiate, quick_poll};
use session::{exchange_token, list_sessions, logout, relock, revoke_session};

pub(crate) use session::issue_tokens;
pub(super) use session::mint_device_tokens;

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

pub const MAX_AVATAR_BYTES: usize = 8 * 1024 * 1024;

pub(crate) fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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
    Json(crate::api::dto::AuthConfig {
        public_user_list: state.settings.get_bool("publicUserList", false),
        has_accounts,
    })
    .into_response()
}

pub async fn me(AuthUser(user): AuthUser) -> Response {
    Json(json!({ "user": user })).into_response()
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
