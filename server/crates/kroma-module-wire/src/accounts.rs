//! The account a session resolves to, and which libraries it may see.

use serde::{Deserialize, Serialize};

use crate::Permission;

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
    #[serde(deserialize_with = "known_permissions")]
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

fn known_permissions<'de, D>(deserializer: D) -> Result<Vec<Permission>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let keys = Vec::<String>::deserialize(deserializer)?;
    Ok(keys
        .iter()
        .filter_map(|key| Permission::parse(key))
        .collect())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

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
    fn a_right_this_build_has_never_heard_of_is_dropped_rather_than_losing_the_account() {
        let sent = json!({
            "id": "u1",
            "email": "a@b.c",
            "username": "alice",
            "permissions": ["playback", "telepathy.read"],
            "libraries": null,
            "createdAt": "",
            "hasPin": false,
        });

        let alice: User = serde_json::from_value(sent).expect("a session the host resolved");

        assert_eq!(alice.permissions, vec![Permission::Playback]);
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
