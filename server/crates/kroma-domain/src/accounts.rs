//! Account types: users, capability permissions, the public profile-picker
//! shape and registration invites.
//!
//! The JSON shape here is a public contract web/TV clients depend on it, so
//! field names and casing must not drift.

use serde::{Deserialize, Serialize};

/// A user account. `password_hash` lives only in the DB layer and is never part
/// of this (serialized) shape, so a `User` is always safe to send to clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub username: String,
    #[serde(rename = "avatarUrl", skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    // An ISO-639 code; `None` falls back to the file's default track. Independent
    // of the UI `language` above (you might browse in French, watch in Japanese).
    #[serde(rename = "audioLanguage", skip_serializing_if = "Option::is_none")]
    pub audio_language: Option<String>,
    // An ISO-639 code, or the sentinel `"off"` to force subtitles off; `None` is
    // no preference.
    #[serde(rename = "subtitleLanguage", skip_serializing_if = "Option::is_none")]
    pub subtitle_language: Option<String>,
    pub permissions: Vec<Permission>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "hasPin")]
    pub has_pin: bool,
}

impl User {
    /// Whether this user holds a given permission. Gates the invite/admin
    /// endpoints via `crate::api::users`'s `require`.
    pub fn can(&self, perm: Permission) -> bool {
        self.permissions.contains(&perm)
    }

    /// Whether this user holds ANY management capability (unlocks the admin
    /// console shell). `requests.manage` counts: a requests moderator needs the
    /// console for the demandes queue even without user/library/settings rights.
    pub fn is_any_admin(&self) -> bool {
        self.can(Permission::UsersManage)
            || self.can(Permission::LibraryManage)
            || self.can(Permission::SettingsManage)
            || self.can(Permission::RequestsManage)
            || self.can(Permission::ReportsManage)
    }
}

/// A granular capability. Stored on each user as a JSON array of the string keys
/// below. Extend this enum (and the TS mirror in `@kroma/core`) to add more
/// e.g. a `stats.view` for the upcoming stats pages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
    #[serde(rename = "users.manage")]
    UsersManage,
    #[serde(rename = "library.manage")]
    LibraryManage,
    #[serde(rename = "settings.manage")]
    SettingsManage,
    #[serde(rename = "playback")]
    Playback,
    #[serde(rename = "requests.create")]
    RequestsCreate,
    #[serde(rename = "requests.manage")]
    RequestsManage,
    #[serde(rename = "requests.auto")]
    RequestsAuto,
    #[serde(rename = "reports.manage")]
    ReportsManage,
}

impl Permission {
    /// Parse a stored key; `None` for unknown keys (tolerant forward-compat).
    pub fn parse(s: &str) -> Option<Permission> {
        match s {
            "users.manage" => Some(Permission::UsersManage),
            "library.manage" => Some(Permission::LibraryManage),
            "settings.manage" => Some(Permission::SettingsManage),
            "playback" => Some(Permission::Playback),
            "requests.create" => Some(Permission::RequestsCreate),
            "requests.manage" => Some(Permission::RequestsManage),
            "requests.auto" => Some(Permission::RequestsAuto),
            "reports.manage" => Some(Permission::ReportsManage),
            _ => None,
        }
    }

    /// Every permission granted to the owner account.
    pub fn all() -> Vec<Permission> {
        vec![
            Permission::UsersManage,
            Permission::LibraryManage,
            Permission::SettingsManage,
            Permission::Playback,
            Permission::RequestsCreate,
            Permission::RequestsManage,
            Permission::RequestsAuto,
            Permission::ReportsManage,
        ]
    }
}

/// Derive a display role label from a capability set. The backend is
/// capability-based; this is purely for the admin UI's "Rôle" badge.
pub fn role_label(perms: &[Permission]) -> &'static str {
    if perms.contains(&Permission::UsersManage) && perms.contains(&Permission::SettingsManage) {
        "Propriétaire"
    } else if perms.contains(&Permission::Playback) {
        "Membre"
    } else {
        "Restreint"
    }
}

/// The publicly-listable subset of a user, surfaced by `GET /api/users` to
/// populate the "Qui regarde ?" profile picker (no email).
#[derive(Debug, Clone, Serialize)]
pub struct PublicUser {
    pub id: String,
    pub username: String,
    #[serde(rename = "avatarUrl", skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(rename = "hasPin")]
    pub has_pin: bool,
}

/// A registration invitation created by a user with `users.manage`. After the
/// bootstrap owner, an invite is the only way to create an account.
#[derive(Debug, Clone, Serialize)]
pub struct Invite {
    pub token: String,
    pub permissions: Vec<Permission>,
    #[serde(rename = "createdBy", skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: i64,
    pub used: bool,
}
