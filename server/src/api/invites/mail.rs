//! An invitation sent to a mailbox by the server, the way a credential reset is.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::admin::{relay_url, web_base};
use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::api::util::query;
use crate::db;
use crate::i18n;
use crate::model::{Permission, User};
use crate::services::email::{self, Delivery, EmailKind, OutboundEmail, RelayTarget};
use crate::state::SharedState;

const MAX_ADDRESS_CHARS: usize = 254;

#[derive(Debug, Deserialize)]
pub struct MailInviteBody {
    pub to: String,
    #[serde(default)]
    pub locale: Option<String>,
}

fn recipient(raw: &str) -> Option<String> {
    let address = raw.trim().to_lowercase();
    let plausible = address.contains('@')
        && address.chars().count() <= MAX_ADDRESS_CHARS
        && !address.chars().any(|c| c.is_whitespace() || c.is_control());
    plausible.then_some(address)
}

async fn live_invite(state: &SharedState, loc: &str, token: &str) -> Result<(), Response> {
    let token = token.to_string();
    let invite = query(&state.db, move |pool| db::get_invite(&pool, &token)).await?;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    match invite {
        None => Err(lerr(loc, StatusCode::NOT_FOUND, "admin.invitationGone")),
        Some(invite) if invite.used || invite.expires_at <= now => {
            Err(lerr(loc, StatusCode::CONFLICT, "admin.invitationSpent"))
        }
        Some(_) => Ok(()),
    }
}

fn written_in(body: &MailInviteBody, user: &User) -> &'static str {
    body.locale
        .as_deref()
        .and_then(i18n::normalize)
        .unwrap_or_else(|| i18n::user_locale(user))
}

fn delivered(delivery: Delivery) -> Response {
    Json(json!({ "delivered": delivery.as_str() })).into_response()
}

/// `POST /api/invites/:token/mail` `{ to, locale? }` (Bearer + `users.manage`)
/// → `{ delivered }`, as a reset answers. The message is written in `locale`,
/// else in the caller's language, and its one link leads to this server's
/// public address, the only origin the relay lets it link to. `manual` when
/// the server sends no mail or knows no public address. `400` for an address
/// that is not one, `404` for an unknown invitation, `409` for one spent or
/// expired, `502` when the mail could not leave. The invitation never changes.
pub async fn mail_invite(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(token): Path<String>,
    Json(body): Json<MailInviteBody>,
) -> Result<Response, Response> {
    require(&user, Permission::UsersManage)?;
    let loc = i18n::user_locale(&user);
    let to = recipient(&body.to).ok_or_else(|| {
        lerr(
            loc,
            StatusCode::BAD_REQUEST,
            "admin.invitationMailAddressInvalid",
        )
    })?;
    live_invite(&state, loc, &token).await?;
    let Some(origin) = web_base(&state) else {
        return Ok(delivered(Delivery::Manual));
    };
    let message = OutboundEmail {
        to,
        locale: written_in(&body, &user),
        url: format!("{origin}/join?invite={token}"),
        server_name: state.settings.get_str("serverName", "KROMA"),
        kind: EmailKind::Invite,
    };
    let target = RelayTarget {
        url: relay_url(&state),
        origin: &origin,
    };
    match email::send(&state.settings, &state.db, Some(&target), &message).await {
        Ok(delivery) => Ok(delivered(delivery)),
        Err(why) => {
            let prefix = i18n::t(loc, "admin.invitationMailFailed", &[]);
            Err(json_error(
                StatusCode::BAD_GATEWAY,
                &format!("{prefix}: {why}"),
            ))
        }
    }
}
