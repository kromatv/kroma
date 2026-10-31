use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// The settings store a module reads through `settings.get`, narrowed to the
/// keys its manifest declared: any other key reads as absent, stored or not.
#[derive(Clone, Default)]
pub struct Settings {
    declared: BTreeSet<String>,
    values: BTreeMap<String, String>,
}

impl Settings {
    pub fn new<K, V>(
        declared: impl IntoIterator<Item = K>,
        values: impl IntoIterator<Item = (K, V)>,
    ) -> Self
    where
        K: Into<String>,
        V: Into<String>,
    {
        Self {
            declared: declared.into_iter().map(Into::into).collect(),
            values: values
                .into_iter()
                .map(|(key, value)| (key.into(), value.into()))
                .collect(),
        }
    }

    pub(crate) fn get(&self, key: &str) -> Option<String> {
        if !self.declared.contains(key) {
            return None;
        }
        self.values.get(key).cloned()
    }
}

impl fmt::Debug for Settings {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Settings")
            .field("declared", &self.declared)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::Settings;

    #[test]
    fn a_debug_print_names_the_declared_keys_and_never_a_value() {
        let settings = Settings::new(["token"], [("token", "s3cret")]);

        let printed = format!("{settings:?}");

        assert!(printed.contains("token"));
        assert!(!printed.contains("s3cret"));
    }
}
