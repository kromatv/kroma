//! How an interface locale relates to stored content: metadata, episodes and
//! the text a model writes are kept once per language, so a regional locale
//! that only overrides a few messages of its language reads that language's.

use std::collections::HashMap;
use std::sync::OnceLock;

use super::tag;

pub(super) struct Offered<'a> {
    locales: &'a [&'a str],
    fallback: Option<&'a str>,
    source: &'a str,
}

pub(super) const REAL: Offered<'static> = Offered {
    locales: super::SUPPORTED_LOCALES,
    fallback: super::parts::FALLBACK,
    source: super::DEFAULT_LOCALE,
};

impl<'a> Offered<'a> {
    pub(super) fn resolve(&self, tag: &str) -> Option<&'a str> {
        tag::nearest(tag, self.locales)
    }

    fn keeps_content(&self, locale: &str) -> bool {
        !tag::parents(locale).any(|parent| self.locales.contains(&parent))
    }

    fn content_locales(&self) -> Vec<&'a str> {
        let keeps = |locale: &&str| self.keeps_content(locale);
        self.locales.iter().copied().filter(keeps).collect()
    }

    fn reads(&self, tag: &str) -> Option<&'a str> {
        let own = |code: &str| {
            let offered = self.locales.iter().copied().find(|locale| *locale == code);
            offered.filter(|locale| self.keeps_content(locale))
        };
        std::iter::once(tag).chain(tag::parents(tag)).find_map(own)
    }

    fn fallback_content(&self) -> Option<&'a str> {
        self.fallback.and_then(|fallback| self.reads(fallback))
    }

    fn content_locale(&self, reader: &str) -> &'a str {
        self.reads(reader)
            .or_else(|| self.fallback_content())
            .unwrap_or(self.source)
    }

    fn content_chain(&self, reader: &str) -> Vec<&'a str> {
        let mut chain = vec![self.content_locale(reader)];
        for next in self.fallback_content().into_iter().chain([self.source]) {
            if !chain.contains(&next) {
                chain.push(next);
            }
        }
        chain
    }

    fn pick<'m, V>(
        &self,
        by: impl IntoIterator<Item = (&'m String, &'m V)>,
        reader: &str,
    ) -> Option<&'m V> {
        let mut entries: Vec<(&str, &V)> = by.into_iter().map(|(k, v)| (k.as_str(), v)).collect();
        entries.sort_unstable_by_key(|(key, _)| *key);
        self.content_chain(reader)
            .iter()
            .find_map(|locale| entries.iter().find(|(key, _)| key == locale))
            .or(entries.first())
            .map(|(_, value)| *value)
    }

    fn content_keyed<V>(
        &self,
        answer: impl IntoIterator<Item = (String, V)>,
    ) -> HashMap<String, V> {
        let mut entries: Vec<(String, V)> = answer.into_iter().collect();
        entries.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));
        let mut keyed = HashMap::new();
        for (key, value) in entries {
            let named = self
                .resolve(&key)
                .filter(|locale| self.keeps_content(locale));
            let Some(locale) = named else { continue };
            if key == locale {
                keyed.insert(locale.to_owned(), value);
            } else {
                keyed.entry(locale.to_owned()).or_insert(value);
            }
        }
        keyed
    }
}

/// The offered locales that keep content of their own: every one of
/// [`super::SUPPORTED_LOCALES`] but a regional locale whose language is
/// offered too, which reads that language's.
pub fn content_locales() -> &'static [&'static str] {
    static CONTENT: OnceLock<Vec<&'static str>> = OnceLock::new();
    CONTENT.get_or_init(|| REAL.content_locales())
}

/// The locale a reader's stored content is in: the reader's own when it keeps
/// content, else the nearest language its tag belongs to, else the project's
/// fallback, else [`super::DEFAULT_LOCALE`]. Interface strings are not content
/// and keep the reader's own locale.
pub fn content_locale(reader: &str) -> &'static str {
    REAL.content_locale(reader)
}

/// The content locales a reader is served from, in order and each once:
/// [`content_locale`], the project's fallback, then [`super::DEFAULT_LOCALE`].
pub fn content_chain(reader: &str) -> Vec<&'static str> {
    REAL.content_chain(reader)
}

/// What a reader is shown out of a `locale -> value` map: the first hit along
/// [`content_chain`], else the value under the smallest key, so the same map
/// always answers the same.
pub fn pick<'m, V>(
    by: impl IntoIterator<Item = (&'m String, &'m V)>,
    reader: &str,
) -> Option<&'m V> {
    REAL.pick(by, reader)
}

/// A `language -> value` answer a model wrote, keyed by the content locale each
/// key names however it is spelled (`pt-br`, `zh_Hant`). A key that names none
/// is dropped, and a key spelled exactly wins over one that only resolves.
pub fn content_keyed<V>(answer: impl IntoIterator<Item = (String, V)>) -> HashMap<String, V> {
    REAL.content_keyed(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIVE: Offered<'static> = Offered {
        locales: &["en", "fr", "fr-CH", "pt-BR", "zh-Hant"],
        fallback: Some("en"),
        source: "fr",
    };

    fn by(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(locale, text)| ((*locale).to_owned(), (*text).to_owned()))
            .collect()
    }

    #[test]
    fn a_regional_locale_whose_language_is_offered_keeps_no_content() {
        assert_eq!(FIVE.content_locales(), ["en", "fr", "pt-BR", "zh-Hant"]);
    }

    #[test]
    fn a_reader_reads_its_own_content_or_its_languages() {
        assert_eq!(FIVE.content_locale("fr-CH"), "fr");
        assert_eq!(FIVE.content_locale("fr"), "fr");
        assert_eq!(FIVE.content_locale("pt-BR"), "pt-BR");
        assert_eq!(FIVE.content_locale("zh-Hant"), "zh-Hant");
    }

    #[test]
    fn a_reader_nobody_offers_reads_the_fallback_and_the_source_without_one() {
        let no_fallback = Offered {
            fallback: None,
            ..FIVE
        };

        assert_eq!(FIVE.content_locale("de"), "en");
        assert_eq!(FIVE.content_locale("fr-BE"), "fr");
        assert_eq!(no_fallback.content_locale("de"), "fr");
    }

    #[test]
    fn a_reader_is_served_its_content_then_the_fallback_then_the_source_each_once() {
        assert_eq!(FIVE.content_chain("fr-CH"), ["fr", "en"]);
        assert_eq!(FIVE.content_chain("pt-BR"), ["pt-BR", "en", "fr"]);
        assert_eq!(FIVE.content_chain("en"), ["en", "fr"]);
    }

    #[test]
    fn a_fallback_nobody_offers_is_left_out_of_the_chain() {
        let drafted = Offered {
            fallback: Some("de"),
            ..FIVE
        };

        assert_eq!(drafted.content_chain("pt-BR"), ["pt-BR", "fr"]);
    }

    #[test]
    fn a_map_answers_in_the_first_language_of_the_readers_chain() {
        let texts = by(&[("fr", "Titre"), ("en", "Title"), ("zh-Hant", "片名")]);

        assert_eq!(
            FIVE.pick(&texts, "fr-CH").map(String::as_str),
            Some("Titre")
        );
        assert_eq!(
            FIVE.pick(&texts, "pt-BR").map(String::as_str),
            Some("Title")
        );
        assert_eq!(
            FIVE.pick(&texts, "zh-Hant").map(String::as_str),
            Some("片名")
        );
    }

    #[test]
    fn a_map_with_nothing_on_the_chain_answers_under_its_smallest_key() {
        let texts = by(&[("it", "Titolo"), ("de", "Titel"), ("nl", "Titel NL")]);

        assert_eq!(
            FIVE.pick(&texts, "pt-BR").map(String::as_str),
            Some("Titel")
        );
        assert_eq!(FIVE.pick(&by(&[]), "pt-BR"), None);
    }

    #[test]
    fn a_models_keys_are_respelled_and_the_ones_naming_no_content_locale_dropped() {
        let answer = by(&[
            ("pt-br", "Porque"),
            ("zh_Hant", "因為"),
            ("fr-CH", "Parce que"),
            ("de", "Weil"),
        ]);

        let keyed = FIVE.content_keyed(answer);

        assert_eq!(keyed, by(&[("pt-BR", "Porque"), ("zh-Hant", "因為")]));
    }

    #[test]
    fn a_key_spelled_exactly_wins_over_one_that_only_resolves_to_it() {
        let answer = by(&[
            ("fr-FR", "De France"),
            ("fr", "Exact"),
            ("FR-be", "De Belgique"),
        ]);

        let keyed = FIVE.content_keyed(answer);

        assert_eq!(keyed, by(&[("fr", "Exact")]));
    }

    #[test]
    fn the_two_languages_that_ship_keep_reading_their_own_content() {
        assert_eq!(content_locale("fr"), "fr");
        assert_eq!(content_locale("en"), "en");
        assert!(content_locales().contains(&super::super::DEFAULT_LOCALE));
    }
}
