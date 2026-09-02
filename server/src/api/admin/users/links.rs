//! The two links an owner mints for a member: a credential reset and an address
//! verification. Both are single-use and both try the operator's SMTP server
//! before falling back to the owner copying the link by hand.

use axum::extract::{Path as AxPath, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{Permission, User};
use crate::services::auth;
use crate::services::email::{self, EmailKind, OutboundEmail};
use crate::state::SharedState;

const RESET_TTL: i64 = 48 * 3600;
const VERIFY_TTL: i64 = 7 * 24 * 3600;

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// The base reset/verify links are built against: the configured web URL, else
/// the Remote Access public URL (the same fallback quick-connect links use).
/// Still `None` when neither is set — the client then composes from its own
/// origin, which is right for an owner browsing the very server they admin.
fn web_base(state: &SharedState) -> Option<String> {
    state.config.web_url.clone().or_else(|| {
        let url = crate::services::settings::public_url(&state.settings);
        (!url.is_empty()).then_some(url)
    })
}

/// How the link reached the member: `smtp` once the operator's server took it,
/// `manual` when the owner has to carry it. A send failure never fails the
/// mint, because copying by hand is the default delivery anyway.
async fn deliver(state: &SharedState, to: &User, kind: EmailKind, url: Option<&str>) -> String {
    let Some(url) = url else {
        return "manual".to_string();
    };
    let outbound = OutboundEmail {
        to: to.email.clone(),
        locale: super::super::user_locale(to),
        url: url.to_string(),
        server_name: state.settings.get_str("serverName", "KROMA"),
        kind,
    };
    email::send(&state.settings, &outbound)
        .await
        .unwrap_or("manual")
        .to_string()
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
        delivered,
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
    let url = web_base(&state).map(|w| format!("{w}/verify-email?token={token}"));
    let delivered = deliver(&state, &target, EmailKind::Verify, url.as_deref()).await;
    Ok(Json(crate::api::dto::VerificationCreated {
        token,
        url,
        expires_at,
        delivered,
    })
    .into_response())
}
