//! The links an owner mints for a member: a credential reset and an address
//! verification, which both try the configured delivery before falling back to
//! the owner copying the link by hand, and the invitation of an account that
//! waits. Each is single-use.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::invites::{expires_at, join_url};
use crate::api::util::query;
use crate::db;
use crate::model::{Permission, User};
use crate::services::auth;
use crate::services::email::{self, Delivery, EmailKind, OutboundEmail, RelayTarget};
use crate::state::SharedState;

const RESET_TTL: i64 = 48 * 3600;
pub(in crate::api::admin) const VERIFY_TTL: i64 = 7 * 24 * 3600;

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn outbound(state: &SharedState, to: &User, kind: EmailKind, url: &str) -> OutboundEmail {
    OutboundEmail {
        to: to.email.clone(),
        locale: super::super::user_locale(to),
        url: url.to_string(),
        server_name: state.settings.get_str("serverName", "KROMA"),
        kind,
    }
}

/// How the link reached the member. A send failure never fails the mint,
/// because copying by hand is the default delivery anyway.
async fn deliver(
    state: &SharedState,
    to: &User,
    kind: EmailKind,
    base: Option<&str>,
    url: Option<&str>,
) -> Delivery {
    let Some(url) = url else {
        return Delivery::Manual;
    };
    let target = base.map(|origin| RelayTarget {
        url: super::super::relay_url(state),
        origin,
    });
    match email::send(
        &state.settings,
        &state.db,
        target.as_ref(),
        &outbound(state, to, kind, url),
    )
    .await
    {
        Ok(delivery) => delivery,
        Err(why) => {
            tracing::warn!(user = %to.id, "account email not sent: {why}");
            Delivery::Manual
        }
    }
}

/// `POST /api/admin/users/:id/reset` → mint a credential reset. The link alone
/// is not enough; the owner reads the returned code to the user. `409` for an
/// account that waits on an invitation: a reset is not a way into it.
pub async fn reset_user(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::UsersManage)?;
    let target = super::target_that_does_not_wait(&state, &user, &id).await?;
    let token = auth::random_token();
    let code = auth::random_code();
    let code_hash = auth::hash_password(&code);
    let expires_at = now_unix() + RESET_TTL;
    let (row_token, owner_id, target_id) = (token.clone(), user.id.clone(), id.clone());
    query(&state.db, move |pool| {
        db::create_reset(
            &pool,
            &row_token,
            &target_id,
            &code_hash,
            &owner_id,
            expires_at,
        )
    })
    .await?;
    let base = super::super::web_base(&state);
    let url = base.as_ref().map(|w| format!("{w}/reset?token={token}"));
    let delivered = deliver(
        &state,
        &target,
        EmailKind::Reset,
        base.as_deref(),
        url.as_deref(),
    )
    .await;
    Ok(Json(crate::api::dto::ResetCreated {
        token,
        code,
        url,
        expires_at,
        delivered: delivered.as_str().to_string(),
    })
    .into_response())
}

/// `POST /api/admin/users/:id/email-verification` → mint a verification link
/// for the account's current address and try to deliver it. No code: reaching
/// the mailbox is itself the proof. `409` for an account that waits on an
/// invitation: nobody holds it yet, and it may have no address.
pub async fn send_email_verification(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::UsersManage)?;
    let target = super::target_that_does_not_wait(&state, &user, &id).await?;
    let token = auth::random_token();
    let expires_at = now_unix() + VERIFY_TTL;
    let (row_token, owner_id, target_id) = (token.clone(), user.id.clone(), id.clone());
    let address = target.email.clone();
    query(&state.db, move |pool| {
        db::create_verification(
            &pool,
            &row_token,
            &target_id,
            &address,
            &owner_id,
            expires_at,
        )
    })
    .await?;
    let base = super::super::web_base(&state);
    let url = base.as_ref().map(|w| format!("{w}/verify-email?token={token}"));
    let delivered = deliver(
        &state,
        &target,
        EmailKind::Verify,
        base.as_deref(),
        url.as_deref(),
    )
    .await;
    Ok(Json(crate::api::dto::VerificationCreated {
        token,
        url,
        expires_at,
        delivered: delivered.as_str().to_string(),
    })
    .into_response())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteUserBody {
    #[serde(default)]
    pub expires_in_days: Option<i64>,
}

/// `POST /api/admin/users/:id/invitation` `{ expiresInDays? }` → mint the
/// invitation of an account that waits, which is the only way into it. The
/// one before stops working and the account goes on waiting (ACCT-100). `409`
/// for an account somebody already signs in to.
pub async fn invite_user(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    body: Option<Json<InviteUserBody>>,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::UsersManage)?;
    let target = super::target_or_404(&state, &user, &id).await?;
    let token = auth::random_token();
    let expires_at = expires_at(body.and_then(|Json(body)| body.expires_in_days));
    let (row_token, admin_id, target_id) = (token.clone(), user.id.clone(), id.clone());
    let minted = query(&state.db, move |pool| {
        db::invite_waiting_account(
            &pool,
            &db::AccountInvite {
                token: &row_token,
                user_id: &target_id,
                created_by: &admin_id,
                expires_at,
            },
        )
    })
    .await?;
    if !minted {
        return Err(lerr(
            super::super::user_locale(&user),
            StatusCode::CONFLICT,
            "admin.accountNotWaiting",
        ));
    }
    Ok(Json(crate::api::dto::InviteCreated {
        url: join_url(&state, &token),
        token,
        permissions: target.permissions,
        expires_at,
    })
    .into_response())
}
