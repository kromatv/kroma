//! Redeeming the invitation of an account that waits: the account takes the
//! credential, the name and the address its person brings, and keeps its id.

use axum::http::StatusCode;
use axum::response::Response;

use crate::api::error::lerr;
use crate::api::util::query;
use crate::db;
use crate::services::auth;
use crate::state::SharedState;

use super::issue_tokens;

pub(super) struct Joining {
    pub token: String,
    pub email: String,
    pub username: String,
    pub password: String,
}

pub(super) async fn invited_account(
    state: &SharedState,
    invite: Option<&str>,
) -> Result<Option<String>, Response> {
    let Some(token) = invite.map(str::trim).filter(|token| !token.is_empty()) else {
        return Ok(None);
    };
    let token = token.to_string();
    let invitee = query(&state.db, move |pool| db::invitee(&pool, &token)).await?;
    Ok(invitee.map(|invitee| invitee.user_id))
}

pub(super) async fn claim(
    state: SharedState,
    loc: &str,
    device: db::DeviceHints,
    joining: Joining,
) -> Response {
    let hash = auth::hash_password(&joining.password);
    let claimed = query(&state.db, move |pool| {
        let brought = db::Claim {
            email: &joining.email,
            username: Some(&joining.username),
            credential: db::Credential::PasswordHash(&hash),
        };
        let user = db::claim_account(&pool, joining.token.trim(), &brought)?;
        if let Some(user) = &user {
            db::set_whats_new_seen(&pool, &user.id, crate::VERSION)?;
        }
        Ok(user)
    })
    .await;
    match claimed {
        Ok(Some(user)) => issue_tokens(state, user, device).await,
        Ok(None) => lerr(loc, StatusCode::FORBIDDEN, "auth.inviteInvalid"),
        Err(resp) => resp,
    }
}
