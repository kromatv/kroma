//! A small, generic i18n engine — a framework-agnostic Rust counterpart to
//! `@kroma/core`'s `i18n.ts`.
//!
//! Nothing here is application-specific: build an [`I18n`] instance from your
//! own catalogs, default locale, and plural rules, then translate against it.
//! Provides `{name}` interpolation, CLDR pluralization, locale
//! normalization/detection, and a default→raw-key fallback chain.

use std::collections::HashMap;

mod builder;
mod interpolate;
mod locale;
mod plural;
#[cfg(test)]
mod test_support;

pub use builder::{BuildError, Builder};
pub use interpolate::interpolate;
pub use plural::{one_other, Category, PluralRule};

/// A configured translation engine. Cheap to share behind an `Arc`/`OnceLock`;
/// build once at startup.
pub struct I18n {
    default: String,
    locales: Vec<Locale>,
    plural: PluralRule,
}

struct Locale {
    code: String,
    label_key: String,
    entries: HashMap<String, String>,
}

/// A locale's code and the message key holding its native display name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocaleInfo<'a> {
    pub code: &'a str,
    pub label_key: &'a str,
}

impl I18n {
    /// Start building an engine.
    pub fn builder() -> Builder {
        Builder::default()
    }

    /// The configured fallback locale.
    pub fn default_locale(&self) -> &str {
        &self.default
    }

    /// Supported locale codes, default first.
    pub fn supported(&self) -> impl Iterator<Item = &str> {
        self.locales.iter().map(|l| l.code.as_str())
    }

    /// Every locale's code + native-label key, default first.
    pub fn locales(&self) -> impl Iterator<Item = LocaleInfo<'_>> {
        self.locales.iter().map(|l| LocaleInfo {
            code: &l.code,
            label_key: &l.label_key,
        })
    }

    /// Whether `code` is a supported locale.
    pub fn is_locale(&self, code: &str) -> bool {
        self.locales.iter().any(|l| l.code == code)
    }

    /// Whether `key` exists in the default (authoritative) catalog.
    pub fn is_message_key(&self, key: &str) -> bool {
        self.lookup(&self.default, key).is_some()
    }

    fn lookup(&self, code: &str, key: &str) -> Option<&str> {
        self.locales
            .iter()
            .find(|l| l.code == code)?
            .entries
            .get(key)
            .map(String::as_str)
    }

    fn has_key(&self, code: &str, key: &str) -> bool {
        self.lookup(code, key).is_some() || self.lookup(&self.default, key).is_some()
    }

    // The plural category uses the caller's original `tag` (so a custom rule
    // sees `pt_BR` vs `pt_PT`); the variant is then looked up under `code`.
    fn resolve_plural_key(&self, tag: &str, code: &str, key: &str, count: i64) -> String {
        let variant = format!("{key}_{}", (self.plural)(tag, count).suffix());
        if self.has_key(code, &variant) {
            return variant;
        }
        let other = format!("{key}_other");
        if self.has_key(code, &other) {
            return other;
        }
        key.to_string()
    }

    /// Translate `key` in `locale`, falling back to the default locale then the
    /// raw key. Regional tags resolve to their base catalog (`fr_CH` → `fr`). A
    /// numeric `count` var selects a plural variant and, like every var, is
    /// interpolated into `{count}`.
    pub fn translate(&self, locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
        let code = self.resolve_code(locale).unwrap_or(&self.default);
        let count = vars
            .iter()
            .find(|(k, _)| *k == "count")
            .and_then(|(_, v)| v.parse::<i64>().ok());
        let lookup_key = match count {
            Some(c) => self.resolve_plural_key(locale, code, key, c),
            None => key.to_string(),
        };
        let template = self
            .lookup(code, &lookup_key)
            .or_else(|| self.lookup(&self.default, &lookup_key))
            .unwrap_or(key);
        interpolate(template, vars)
    }

    /// Short alias for [`translate`](Self::translate).
    pub fn t(&self, locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
        self.translate(locale, key, vars)
    }

    /// A translation function bound to one locale (unknown codes fall back to the
    /// default, so this never fails).
    pub fn translator<'a>(&'a self, locale: &str) -> Translator<'a> {
        let code = self.resolve_code(locale).unwrap_or(&self.default);
        Translator {
            i18n: self,
            locale: code,
        }
    }
}

/// A translation function bound to one locale of an [`I18n`].
#[derive(Clone, Copy)]
pub struct Translator<'a> {
    i18n: &'a I18n,
    locale: &'a str,
}

impl<'a> Translator<'a> {
    /// The bound locale.
    pub fn locale(&self) -> &'a str {
        self.locale
    }

    /// Translate `key` (see [`I18n::translate`]).
    pub fn t(&self, key: &str, vars: &[(&str, &str)]) -> String {
        self.i18n.translate(self.locale, key, vars)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::fixture;

    #[test]
    fn default_leads_and_supported() {
        let i = fixture();
        assert_eq!(i.default_locale(), "fr");
        assert_eq!(i.supported().collect::<Vec<_>>(), vec!["fr", "en"]);
        assert!(i.is_locale("en") && !i.is_locale("de"));
        assert!(i.is_message_key("hi") && !i.is_message_key("nope"));
    }

    #[test]
    fn pluralization_default_one_other() {
        let i = fixture();
        assert_eq!(i.t("en", "seasons", &[("count", "1")]), "1 season");
        assert_eq!(i.t("en", "seasons", &[("count", "0")]), "0 seasons");
        assert_eq!(i.t("fr", "seasons", &[("count", "1")]), "1 saison");
        assert_eq!(i.t("fr", "seasons", &[("count", "2")]), "2 saisons");
        // A key with no `_one` variant just uses the base key (no rule needed).
        assert_eq!(i.t("en", "hi", &[("name", "A"), ("count", "1")]), "Hi A");
    }

    #[test]
    fn a_missing_plural_variant_falls_back_to_other_before_the_bare_key() {
        let i = I18n::builder()
            .default_locale("en")
            .catalog_json("en", r#"{ "seasons_other": "{count} seasons" }"#)
            .build()
            .unwrap();
        assert_eq!(i.t("en", "seasons", &[("count", "1")]), "1 seasons");
    }

    #[test]
    fn plural_rule_is_pluggable() {
        // No baked-in language table: making French treat 0 as singular takes a
        // custom rule, proving the engine doesn't hardcode CLDR.
        fn fr_zero_is_one(locale: &str, count: i64) -> Category {
            if locale.starts_with("fr") && count == 0 {
                Category::One
            } else {
                one_other(locale, count)
            }
        }
        let i = I18n::builder()
            .default_locale("fr")
            .plural_rule(fr_zero_is_one)
            .catalog_json(
                "fr",
                r#"{ "seasons": "{count} saisons", "seasons_one": "{count} saison" }"#,
            )
            .build()
            .unwrap();
        assert_eq!(i.t("fr", "seasons", &[("count", "0")]), "0 saison");
        assert_eq!(i.t("fr", "seasons", &[("count", "2")]), "2 saisons");
    }

    #[test]
    fn fallback_and_translator() {
        let i = fixture();
        assert_eq!(i.t("en", "lang.fr", &[]), "Français");
        assert_eq!(i.t("en", "missing.key", &[]), "missing.key");
        let tr = i.translator("en-US");
        assert_eq!(tr.locale(), "en");
        assert_eq!(tr.t("hi", &[("name", "Sam")]), "Hi Sam");
        assert_eq!(i.translator("xx").locale(), "fr");
    }

    #[test]
    fn the_supported_list_puts_the_default_first() {
        // The picker renders in this order, and the default is what an
        // unconfigured client gets - showing it first is the point.
        let i18n = fixture();
        let codes: Vec<&str> = i18n.supported().collect();
        assert_eq!(codes.first(), Some(&"fr"));
        assert!(codes.contains(&"en"));

        let labelled: Vec<&str> = i18n.locales().map(|l| l.code).collect();
        assert_eq!(codes, labelled, "both views agree on the order");
    }
}
