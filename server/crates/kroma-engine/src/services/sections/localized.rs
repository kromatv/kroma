//! Text a model wrote once per language the server keeps content in.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::i18n;

// Cap on a single section title, defended on parse (catchy, not an essay).
const MAX_TITLE: usize = 64;

/// A row's name, written by the model in every language the server keeps
/// content in.
///
/// Also reads a bare string, which is what rows cached before the model was
/// asked for more than one language hold.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Localized {
    Single(String),
    ByLang(HashMap<String, String>),
}

impl Default for Localized {
    fn default() -> Self {
        Self::Single(String::new())
    }
}

impl Localized {
    /// What a reader of `locale` is shown, picked by [`i18n::pick`].
    pub fn get(&self, locale: &str) -> &str {
        match self {
            Self::Single(s) => s,
            Self::ByLang(by) => i18n::pick(by, locale)
                .map(String::as_str)
                .unwrap_or_default(),
        }
    }

    pub(super) fn is_blank(&self) -> bool {
        match self {
            Self::Single(s) => s.trim().is_empty(),
            Self::ByLang(by) => by.values().all(|v| v.trim().is_empty()),
        }
    }

    pub(super) fn trimmed_and_capped(self) -> Self {
        let cap = |s: String| -> String { s.trim().chars().take(MAX_TITLE).collect() };
        match self {
            Self::Single(s) => Self::Single(cap(s)),
            Self::ByLang(by) => Self::ByLang(
                i18n::content_keyed(by)
                    .into_iter()
                    .map(|(locale, text)| (locale, cap(text)))
                    .collect(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn by_lang(pairs: &[(&str, &str)]) -> Localized {
        Localized::ByLang(
            pairs
                .iter()
                .map(|(key, text)| ((*key).to_owned(), (*text).to_owned()))
                .collect(),
        )
    }

    #[test]
    fn text_the_model_keyed_loosely_is_read_under_the_locale_the_key_names() {
        let written = by_lang(&[("FR", " Soirées polar "), ("en_US", "Noir nights")]);

        let kept = written.trimmed_and_capped();

        assert_eq!(kept.get("fr"), "Soirées polar");
        assert_eq!(kept.get("en"), "Noir nights");
    }

    #[test]
    fn text_in_a_language_the_server_keeps_no_content_in_is_dropped() {
        let written = by_lang(&[("xx", "Nobody reads this")]);

        let kept = written.trimmed_and_capped();

        assert!(kept.is_blank());
    }

    #[test]
    fn a_title_is_cut_at_the_cap() {
        let written = Localized::Single("x".repeat(MAX_TITLE + 10));

        let kept = written.trimmed_and_capped();

        assert_eq!(kept.get("fr").chars().count(), MAX_TITLE);
    }
}
