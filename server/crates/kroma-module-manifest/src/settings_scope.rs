//! The core settings keys a module declares it reads and writes.

use serde::{Deserialize, Serialize};

/// The CORE settings keys a module reads and writes, as the keys themselves.
///
/// The core decides which keys a module may reach at all; this narrows that to
/// the caller. A key the core hands out reaches a module that named it here for
/// that use and no other, preference and credential alike.
///
/// A manifest with no `settings` object declares nothing and reaches nothing,
/// the same as an empty one. One that declares reaches exactly what it lists.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsScope {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub write: Vec<String>,
}

impl SettingsScope {
    pub fn reads(&self, key: &str) -> bool {
        self.read.iter().any(|k| k == key)
    }

    pub fn writes(&self, key: &str) -> bool {
        self.write.iter().any(|k| k == key)
    }

    /// Whether this writes a key `installed` does not, where no declaration
    /// writes nothing.
    pub fn writes_beyond(&self, installed: Option<&SettingsScope>) -> bool {
        self.write
            .iter()
            .any(|key| !installed.is_some_and(|granted| granted.writes(key)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn writing(keys: &[&str]) -> SettingsScope {
        SettingsScope {
            read: Vec::new(),
            write: keys.iter().map(|key| key.to_string()).collect(),
        }
    }

    #[test]
    fn a_new_key_to_write_goes_beyond_what_was_declared() {
        let before = writing(&["acqEnabled"]);

        assert!(writing(&["acqEnabled", "namingMovieFolder"]).writes_beyond(Some(&before)));
        assert!(!writing(&["acqEnabled"]).writes_beyond(Some(&before)));
        assert!(!writing(&[]).writes_beyond(Some(&before)));
    }

    #[test]
    fn any_key_to_write_goes_beyond_a_module_that_declared_none() {
        assert!(writing(&["acqEnabled"]).writes_beyond(None));
        assert!(!writing(&[]).writes_beyond(None));
    }

    #[test]
    fn a_new_key_to_read_does_not_go_beyond_what_was_written() {
        let before = writing(&["acqEnabled"]);
        let reading_more = SettingsScope {
            read: vec!["smtpHost".to_string()],
            write: vec!["acqEnabled".to_string()],
        };

        assert!(!reading_more.writes_beyond(Some(&before)));
    }
}
