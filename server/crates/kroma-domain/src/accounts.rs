//! Account types: users, capability permissions, the public profile-picker
//! shape and registration invites.
//!
//! The JSON shape here is a public contract web/TV clients depend on it, so
//! field names and casing must not drift.

use serde::Serialize;

pub use kroma_module_wire::{Permission, User};

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_permission_parses_back_from_its_stored_key() {
        for perm in Permission::all() {
            let stored = serde_json::to_string(&perm).unwrap();
            let key = stored.trim_matches('"');
            assert_eq!(Permission::parse(key), Some(perm), "{key}");
        }
    }

    #[test]
    fn an_unknown_permission_key_is_ignored_rather_than_failing_the_account() {
        assert_eq!(Permission::parse("modules.manage"), None);
        assert_eq!(Permission::parse(""), None);
    }

    #[test]
    fn the_role_badge_follows_the_capability_set() {
        assert_eq!(role_label(&Permission::all()), "Propriétaire");
        assert_eq!(
            role_label(&[Permission::UsersManage, Permission::SettingsManage]),
            "Propriétaire"
        );
        assert_eq!(
            role_label(&[Permission::Playback, Permission::RequestsCreate]),
            "Membre"
        );
        assert_eq!(role_label(&[Permission::RequestsCreate]), "Restreint");
        assert_eq!(role_label(&[]), "Restreint");
        assert_eq!(role_label(&[Permission::UsersManage]), "Restreint");
    }
}
