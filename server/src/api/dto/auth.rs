use serde::Serialize;

use crate::model::{Permission, User};

/// `{ token, accessToken, mediaTicket, user }` returned by register/login.
/// `token` is the short-lived session bearer; `accessToken` is the long-lived
/// device credential the client stores and later exchanges (see `/auth/token`);
/// `mediaTicket` is what the byte routes take in a URL, for the players that
/// cannot send a header.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub token: String,
    pub access_token: String,
    pub media_ticket: String,
    pub user: User,
}

/// `{ token, mediaTicket, user }` from `/auth/token` a fresh session minted from
/// an access token (the access token itself is unchanged, so it isn't echoed
/// back).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResult {
    pub token: String,
    pub media_ticket: String,
    pub user: User,
}

/// One signed-in device in `GET /auth/me/sessions`. `id` is a non-secret handle
/// (a short hash of the device's access token) used to revoke it; `current`
/// marks the device making the request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub user_agent: Option<String>,
    pub created_at: String,
    pub last_seen: Option<String>,
    pub current: bool,
}

/// One registered passkey in `GET /auth/me/passkeys`. `id` is the credential's
/// stable handle (used to revoke it).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyInfo {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used: Option<String>,
}

/// `GET /api/auth/config` the public login-gate configuration, read before any
/// credential so the client knows what to render.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    // Off by default: hiding it means knowing the URL no longer lists accounts.
    pub public_user_list: bool,
    pub has_accounts: bool,
    pub server_name: String,
    /// Where the activation page posts the owner's yes: set only while
    /// account email goes through the relay.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mail_relay_url: Option<String>,
}

/// `POST /api/invites` result the invite plus a ready-to-share join URL.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteCreated {
    pub token: String,
    pub url: Option<String>,
    pub permissions: Vec<Permission>,
    pub expires_at: i64,
}

/// `POST /api/admin/users/:id/reset` result the reset link plus the one-time
/// code the owner reads to the user. `delivered` is `manual` | `smtp`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetCreated {
    pub token: String,
    pub code: String,
    pub url: Option<String>,
    pub expires_at: i64,
    pub delivered: String,
}

/// `GET /api/auth/reset/:token` the public check before the reset form.
/// Reused by `/api/auth/verify-email/:token`, same shape.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetCheck {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// `POST /api/admin/users/:id/email-verification` result the verification link.
/// No code: reaching the mailbox is itself the proof. `delivered` is
/// `manual` | `smtp`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationCreated {
    pub token: String,
    pub url: Option<String>,
    pub expires_at: i64,
    pub delivered: String,
}
