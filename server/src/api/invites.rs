//! Registration invitations. After the bootstrap owner, registration is
//! invite-only: an admin with `users.manage` mints a single-use token the
//! invitee redeems on the join page.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::api::util::query;
use crate::db;
use crate::model::Permission;
use crate::services::auth;
use crate::state::SharedState;
use axum::routing::{get, post};
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/invites", post(create_invite).get(list_invites))
        .route("/invites/{token}", get(check_invite).delete(delete_invite))
}

/// The join page's address for an invitation, when the server knows its own.
pub(crate) fn join_url(state: &SharedState, token: &str) -> Option<String> {
    state
        .config
        .web_url
        .as_ref()
        .map(|w| format!("{w}/join?invite={token}"))
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteBody {
    #[serde(default)]
    pub permissions: Option<Vec<Permission>>,
    #[serde(rename = "expiresInDays", default)]
    pub expires_in_days: Option<i64>,
}

/// `POST /api/invites` (Bearer + `users.manage`) → mint a registration invite.
pub async fn create_invite(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateInviteBody>,
) -> Result<Response, Response> {
    require(&user, Permission::UsersManage)?;
    let token = auth::random_token();
    let permissions = body
        .permissions
        .unwrap_or_else(|| vec![Permission::Playback]);
    let expires_at = auth::invitation_expiry(body.expires_in_days);

    let token_db = token.clone();
    let perms = permissions.clone();
    let uid = user.id.clone();
    query(&state.db, move |pool| {
        db::create_invite(&pool, &token_db, &perms, &uid, expires_at)
    })
    .await?;
    Ok(Json(super::dto::InviteCreated {
        url: join_url(&state, &token),
        token,
        permissions,
        expires_at,
    })
    .into_response())
}

/// `GET /api/invites` (Bearer + `users.manage`) → pending invites that create
/// an account. The invitation of an account that waits is on the member list.
pub async fn list_invites(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&user, Permission::UsersManage)?;
    let invites = query(&state.db, move |pool| db::list_invites(&pool)).await?;
    Ok(Json(invites).into_response())
}

/// `GET /api/invites/:token` (public) → `{ valid, expiresAt?, username?, email? }`,
/// so the join page can validate before showing the form (the invitee isn't a
/// user yet). A live invitation of an account that waits also says the name and
/// the address that account waits under, for the person to keep or correct.
pub async fn check_invite(State(state): State<SharedState>, Path(token): Path<String>) -> Response {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let found = query(&state.db, move |pool| {
        Ok((db::get_invite(&pool, &token)?, db::invitee(&pool, &token)?))
    })
    .await;
    match found {
        Ok((Some(inv), invitee)) => {
            let (username, email) = invitee.map(|i| (i.username, i.email)).unzip();
            Json(super::dto::InviteCheck {
                valid: !inv.used && inv.expires_at > now,
                expires_at: Some(inv.expires_at),
                username,
                email: email.flatten(),
            })
            .into_response()
        }
        Ok((None, _)) => Json(super::dto::InviteCheck::default()).into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/invites/:token` (Bearer + `users.manage`) → revoke an invite.
pub async fn delete_invite(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(token): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::UsersManage)?;
    query(&state.db, move |pool| db::delete_invite(&pool, &token)).await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
