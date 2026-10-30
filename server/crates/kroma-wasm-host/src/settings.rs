use std::collections::{BTreeMap, BTreeSet};

/// The settings store a module reads through `settings.get`, narrowed to the
/// keys its manifest declared: any other key reads as absent, stored or not.
#[derive(Debug, Clone, Default)]
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
