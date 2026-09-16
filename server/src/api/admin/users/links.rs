//! The two links an owner mints for a member: a credential reset and an address
//! verification. Both are single-use and both try the configured delivery
//! before falling back to the owner copying the link by hand. On the kroma.tv
//! relay, a verification for a mailbox that has not yet consented is the
//! relay's own consent request, and a reset waits until it has.

use axum::extract::{Path as AxPath, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{Permission, User};
use crate::services::auth;
use crate::services::email::{self, Delivery, EmailKind, Enrolment, OutboundEmail, SendError};
use crate::services::settings::{email_delivery, EmailDelivery};
use crate::state::SharedState;

const RESET_TTL: i64 = 48 * 3600;
const VERIFY_TTL: i64 = 7 * 24 * 3600;

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// The base reset/verify links are built against: the configured web URL, else
/// the Remote Access public URL (the same fallback quick-connect links use).
/// Still `None` when neither is set: the client then composes from its own
/// origin, which is right for an owner browsing the very server they admin.
fn web_base(state: &SharedState) -> Option<String> {
    state.config.web_url.clone().or_else(|| {
        let url = crate::services::settings::public_url(&state.settings);
        (!url.is_empty()).then_some(url)
    })
}

fn relay_url(state: &SharedState) -> &str {
    state
        .config
        .mail_relay_url
        .as_deref()
        .unwrap_or(email::RELAY_URL)
}

async fn stored_grant(state: &SharedState, user_id: &str) -> Option<String> {
    let uid = user_id.to_string();
    query(&state.db, move |pool| db::mail_grant(&pool, &uid))
        .await
        .ok()
        .flatten()
        .map(|g| g.grant)
}

/// How the link reached the member. A send failure never fails the mint,
/// because copying by hand is the default delivery anyway.
async fn deliver(state: &SharedState, to: &User, kind: EmailKind, url: Option<&str>) -> Delivery {
    let Some(url) = url else {
        return Delivery::Manual;
    };
    let outbound = OutboundEmail {
        to: to.email.clone(),
        locale: super::super::user_locale(to),
        url: url.to_string(),
        server_name: state.settings.get_str("serverName", "KROMA"),
        kind,
    };
    let grant = stored_grant(state, &to.id).await;
    let uid = to.id.clone();
    match email::send(&state.settings, relay_url(state), &outbound, grant.as_deref()).await {
        Ok(sent) => {
            if let Some(renewed) = sent.renewed_grant {
                let _ = query(&state.db, move |pool| {
                    db::renew_mail_grant(&pool, &uid, &renewed)
                })
                .await;
            }
            sent.delivery
        }
        Err(SendError::GrantGone) => {
            let _ = query(&state.db, move |pool| db::clear_mail_grant(&pool, &uid)).await;
            Delivery::Unconfirmed
        }
        Err(SendError::Failed(why)) => {
            tracing::warn!(user = %to.id, "account email not sent: {why}");
            Delivery::Manual
        }
    }
}

/// On the relay, a mailbox that has not consented cannot be written to: the
/// relay asks it, carrying this token so the click comes back as a verification.
async fn ask_consent(state: &SharedState, to: &User, origin: &str, token: &str) -> Delivery {
    let enrolment = Enrolment {
        address: &to.email,
        origin,
        server_name: &state.settings.get_str("serverName", "KROMA"),
        locale: super::super::user_locale(to),
        token,
    };
    match email::enrol(relay_url(state), &enrolment).await {
        Ok(()) => Delivery::Relay,
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
    let url = web_base(&state).map(|w| format!("{w}/reset?token={token}"));
    let delivered = deliver(&state, &target, EmailKind::Reset, url.as_deref()).await;
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
    let base = web_base(&state);
    let url = base.as_ref().map(|w| format!("{w}/verify-email?token={token}"));
    let delivered = match (email_delivery(&state.settings), &base) {
        (EmailDelivery::Relay, Some(origin)) if stored_grant(&state, &target.id).await.is_none() => {
            ask_consent(&state, &target, origin, &token).await
        }
        _ => deliver(&state, &target, EmailKind::Verify, url.as_deref()).await,
    };
    Ok(Json(crate::api::dto::VerificationCreated {
        token,
        url,
        expires_at,
        delivered: delivered.as_str().to_string(),
    })
    .into_response())
}
