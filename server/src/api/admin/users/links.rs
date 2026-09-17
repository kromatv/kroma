//! The two links an owner mints for a member: a credential reset and an address
//! verification. Both are single-use and both try the configured delivery
//! before falling back to the owner copying the link by hand. On the kroma.tv
//! relay, a verification is the question the relay asks the mailbox, and a
//! reset waits until the mailbox has answered.

use axum::extract::{Path as AxPath, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{Permission, User};
use crate::services::auth;
use crate::services::email::{self, Delivery, EmailKind, OutboundEmail, RelayTarget};
use crate::services::settings::{email_delivery, EmailDelivery};
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

/// On the relay, a verification is the relay's question to the mailbox, in
/// this server's words, carrying this token so the click comes back as a
/// verification.
async fn ask_consent(state: &SharedState, to: &User, origin: &str, token: &str) -> Delivery {
    let target = RelayTarget {
        url: super::super::relay_url(state),
        origin,
    };
    match email::ask_consent(
        &state.settings,
        &state.db,
        &target,
        &outbound(state, to, EmailKind::Consent, ""),
        token,
    )
    .await
    {
        Ok(delivery) => delivery,
        Err(why) => {
            tracing::warn!(user = %to.id, "relay consent not requested: {why}");
            Delivery::Manual
        }
    }
}

/// `POST /api/admin/users/:id/reset` → mint a credential reset. The link alone
/// is not enough; the owner reads the returned code to the user.
pub async fn reset_user(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::UsersManage)?;
    let target = super::target_or_404(&state, &user, &id).await?;
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
/// the mailbox is itself the proof.
pub async fn send_email_verification(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::UsersManage)?;
    let target = super::target_or_404(&state, &user, &id).await?;
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
    let delivered = match (email_delivery(&state.settings), &base) {
        (EmailDelivery::Relay, Some(origin)) => ask_consent(&state, &target, origin, &token).await,
        _ => {
            deliver(
                &state,
                &target,
                EmailKind::Verify,
                base.as_deref(),
                url.as_deref(),
            )
            .await
        }
    };
    Ok(Json(crate::api::dto::VerificationCreated {
        token,
        url,
        expires_at,
        delivered: delivered.as_str().to_string(),
    })
    .into_response())
}
