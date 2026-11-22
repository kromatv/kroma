//! The steps of a registration with a password: reading the form, whether an
//! invitation is open, whether the name and the address are free, the owner of
//! an empty server, and the account an invitation makes.

use std::net::SocketAddr;

use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;

use crate::api::error::lerr;
use crate::api::util::{client_ip, query};
use crate::db;
use crate::model::User;
use crate::services::auth;
use crate::state::SharedState;

use super::credentials::{MIN_PASSWORD_LEN, RegisterBody};
use super::waiting::Joining;

pub(super) struct Registrant {
    pub email: String,
    pub username: String,
    pub password: String,
}

pub(super) fn registrant(body: &RegisterBody) -> Option<Registrant> {
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

pub(super) async fn invite_open(
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

pub(super) struct NameCheck {
    pub email: String,
    pub username: String,
    pub own: Option<String>,
}

pub(super) async fn names_free(
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

pub(super) fn from_lan(state: &SharedState, headers: &HeaderMap, addr: &SocketAddr) -> bool {
    let ip = client_ip(headers, addr, &state.config.trusted_proxies);
    crate::services::playback::is_lan(
        &ip,
        &crate::services::settings::local_networks(&state.settings),
    )
}

pub(super) async fn create_owner(
    state: &SharedState,
    who: &Registrant,
) -> Result<Option<User>, Response> {
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

pub(super) async fn invited_user(
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
