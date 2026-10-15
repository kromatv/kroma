//! The rights an account may hold, and the keys they are stored and sent as.

use serde::{Deserialize, Serialize};

/// A granular capability. Stored on each user as a JSON array of the string keys
/// below. Extend this enum (and the TS mirror in `@kromatv/core`) to add more.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    UsersManage,
    LibraryManage,
    SettingsManage,
    Playback,
    RequestsCreate,
    RequestsManage,
    RequestsAuto,
    ReportsManage,
    WatchablePlay,
}

macro_rules! rights {
    ($($variant:ident => $key:literal),+ $(,)?) => {
        impl Permission {
            pub const fn key(self) -> &'static str {
                match self {
                    $(Permission::$variant => $key),+
                }
            }

            /// Parse a stored key; `None` for one this build does not know.
            pub fn parse(key: &str) -> Option<Permission> {
                match key {
                    $($key => Some(Permission::$variant),)+
                    _ => None,
                }
            }

            /// Every permission granted to the owner account.
            pub fn all() -> Vec<Permission> {
                vec![$(Permission::$variant),+]
            }
        }
    };
}

rights! {
    UsersManage => "users.manage",
    LibraryManage => "library.manage",
    SettingsManage => "settings.manage",
    Playback => "playback",
    RequestsCreate => "requests.create",
    RequestsManage => "requests.manage",
    RequestsAuto => "requests.auto",
    ReportsManage => "reports.manage",
    WatchablePlay => "watchable.play",
}

impl Permission {
    /// Modules built before [`User`](crate::User) started dropping what it
    /// cannot name parse the `/_host/session` answer with a strict enum, and one
    /// unknown key reads to them as no session at all. A right outside this set
    /// reaches a sidecar only when its manifest asks for it by key.
    pub const fn known_to_every_module(self) -> bool {
        match self {
            Permission::UsersManage
            | Permission::LibraryManage
            | Permission::SettingsManage
            | Permission::Playback
            | Permission::RequestsCreate
            | Permission::RequestsManage
            | Permission::RequestsAuto
            | Permission::ReportsManage => true,
            Permission::WatchablePlay => false,
        }
    }
}

impl Serialize for Permission {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.key())
    }
}

impl<'de> Deserialize<'de> for Permission {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let key = String::deserialize(deserializer)?;
        Permission::parse(&key)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown permission `{key}`")))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_right_no_older_module_can_name_has_to_be_asked_for() {
        assert!(!Permission::WatchablePlay.known_to_every_module());
        assert!(Permission::Playback.known_to_every_module());
        assert!(Permission::RequestsAuto.known_to_every_module());
    }

    #[test]
    fn every_granted_right_crosses_the_wire_as_the_key_it_is_stored_as() {
        for right in Permission::all() {
            let sent = serde_json::to_value(right).unwrap();

            assert_eq!(sent, json!(right.key()), "{right:?}");
            assert_eq!(Permission::parse(right.key()), Some(right), "{right:?}");
            assert_eq!(
                serde_json::from_value::<Permission>(sent).unwrap(),
                right,
                "{right:?}"
            );
        }
    }
}
