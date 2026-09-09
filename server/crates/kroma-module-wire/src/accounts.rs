//! The account a session resolves to, and the capabilities it may hold.

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
    pub libraries: LibraryScope,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "hasPin")]
    pub has_pin: bool,
}

/// Which libraries an account may browse, search and play (ACCT-20). Serializes
/// as `null` for [`LibraryScope::All`] and as an array of library ids otherwise,
/// so a stored `NULL` and an absent field both read as every library: an upgrade
/// never narrows an account that was never narrowed on purpose.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "Option<Vec<String>>", into = "Option<Vec<String>>")]
pub enum LibraryScope {
    #[default]
    All,
    Only(Vec<String>),
}

impl LibraryScope {
    pub fn admits(&self, library: &str) -> bool {
        match self {
            LibraryScope::All => true,
            LibraryScope::Only(ids) => ids.iter().any(|id| id == library),
        }
    }
}

impl From<Option<Vec<String>>> for LibraryScope {
    fn from(value: Option<Vec<String>>) -> Self {
        match value {
            None => LibraryScope::All,
            Some(ids) => LibraryScope::Only(ids),
        }
    }
}

impl From<LibraryScope> for Option<Vec<String>> {
    fn from(value: LibraryScope) -> Self {
        match value {
            LibraryScope::All => None,
            LibraryScope::Only(ids) => Some(ids),
        }
    }
}

impl User {
    /// Whether this user holds a given permission. Gates the invite/admin
    /// endpoints via `crate::api::users`'s `require`.
    pub fn can(&self, perm: Permission) -> bool {
        self.permissions.contains(&perm)
    }

    /// Whether this account may see `library`, and so browse, find and play what
    /// is in it. An account that can edit users, libraries or settings always
    /// may: it can lift its own restriction in one request, so enforcing one
    /// against it would hide the server from the people who run it.
    pub fn sees_library(&self, library: &str) -> bool {
        self.sees_every_library() || self.libraries.admits(library)
    }

    pub fn sees_every_library(&self) -> bool {
        self.can(Permission::UsersManage)
            || self.can(Permission::LibraryManage)
            || self.can(Permission::SettingsManage)
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
/// below. Extend this enum (and the TS mirror in `@kromatv/core`) to add more
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

#[cfg(test)]
mod tests {
    use super::*;

    fn user(permissions: Vec<Permission>, libraries: LibraryScope) -> User {
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "alice".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions,
            libraries,
            created_at: String::new(),
            has_pin: false,
        }
    }

    #[test]
    fn an_account_with_no_grant_on_record_sees_every_library() {
        let alice = user(vec![Permission::Playback], LibraryScope::All);

        assert!(alice.sees_library("films"));
        assert!(alice.sees_library("anything-at-all"));
    }

    #[test]
    fn a_granted_account_sees_the_named_libraries_and_nothing_else() {
        let alice = user(
            vec![Permission::Playback],
            LibraryScope::Only(vec!["films".into()]),
        );

        assert!(alice.sees_library("films"));
        assert!(!alice.sees_library("series"));
    }

    #[test]
    fn an_empty_grant_sees_nothing() {
        let alice = user(vec![Permission::Playback], LibraryScope::Only(Vec::new()));

        assert!(!alice.sees_library("films"));
    }

    #[test]
    fn an_account_that_runs_the_server_sees_a_library_it_was_not_granted() {
        for perm in [
            Permission::UsersManage,
            Permission::LibraryManage,
            Permission::SettingsManage,
        ] {
            let admin = user(vec![perm], LibraryScope::Only(Vec::new()));
            assert!(admin.sees_library("films"), "{perm:?}");
        }

        let moderator = user(
            vec![Permission::RequestsManage, Permission::ReportsManage],
            LibraryScope::Only(Vec::new()),
        );
        assert!(!moderator.sees_library("films"));
    }

    #[test]
    fn the_scope_crosses_the_wire_as_null_or_a_list_of_ids() {
        assert_eq!(serde_json::to_string(&LibraryScope::All).unwrap(), "null");
        assert_eq!(
            serde_json::to_string(&LibraryScope::Only(vec!["films".into()])).unwrap(),
            r#"["films"]"#
        );
        assert_eq!(
            serde_json::from_str::<LibraryScope>("null").unwrap(),
            LibraryScope::All
        );
        assert_eq!(
            serde_json::from_str::<LibraryScope>(r#"["films"]"#).unwrap(),
            LibraryScope::Only(vec!["films".into()])
        );
    }
}
