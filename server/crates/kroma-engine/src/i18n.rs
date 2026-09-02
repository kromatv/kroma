//! KROMA's i18n wiring over the generic [`kroma_i18n`] engine: the default
//! locale, the supported set, and the shared catalogs in
//! `packages/core/src/locales/<locale>/<namespace>.json` (the same files the TS
//! clients bundle), gathered by `build.rs` into one list of parts.

use std::convert::Infallible;
use std::sync::OnceLock;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use kroma_i18n::I18n;

use crate::state::SharedState;

pub const DEFAULT_LOCALE: &str = "fr";

mod parts {
    include!(concat!(env!("OUT_DIR"), "/catalog_parts.rs"));
}

/// Every locale with a catalog folder, in folder order. The folder is the one
/// place a language is added, so this is read from it rather than repeated.
pub const SUPPORTED_LOCALES: &[&str] = parts::LOCALES;

// The catalogs are shared with the TypeScript clients, which select a variant
// through `Intl.PluralRules`. French puts zero in `one` there and English does
// not, so the same key has to resolve the same way on both sides or a count of
// zero renders differently in a notification than it does on screen.
fn i18n() -> &'static I18n {
    static ENGINE: OnceLock<I18n> = OnceLock::new();
    ENGINE.get_or_init(|| {
        parts::CATALOG_PARTS
            .iter()
            .fold(
                I18n::builder()
                    .default_locale(DEFAULT_LOCALE)
                    .plural_rule(kroma_i18n::cldr),
                |builder, (code, json)| builder.catalog_json(*code, *json),
            )
            .build()
            .expect("KROMA i18n catalogs")
    })
}

/// Translate `key` in `locale`, falling back to [`DEFAULT_LOCALE`] then the raw
/// key. A numeric `count` var selects a CLDR plural variant.
pub fn t(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    i18n().t(locale, key, vars)
}

/// Map a BCP-47 tag or native display name to a supported locale, or `None`.
pub fn normalize(tag: &str) -> Option<&'static str> {
    i18n().normalize_locale(tag)
}

/// Whether `key` names a real entry in the catalogs. Only
/// [`kroma_domain::ParamValue::Legacy`] asks, for rows written before params
/// carried their own kind.
pub fn is_message_key(key: &str) -> bool {
    i18n().is_message_key(key)
}

/// A user's account locale for server-rendered strings, falling back to
/// [`DEFAULT_LOCALE`] for an unset or unknown value.
pub fn user_locale(user: &kroma_domain::User) -> &'static str {
    user.language
        .as_deref()
        .and_then(normalize)
        .unwrap_or(DEFAULT_LOCALE)
}

/// Best locale from an explicit preference and/or an `Accept-Language` header.
pub fn detect_locale(preferred: Option<&str>, accept_language: Option<&str>) -> &'static str {
    i18n().detect_locale(preferred, accept_language)
}

/// The resolved request locale, from `Accept-Language` (else [`DEFAULT_LOCALE`]).
pub struct ReqLocale(pub &'static str);

impl FromRequestParts<SharedState> for ReqLocale {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok());
        Ok(ReqLocale(detect_locale(None, header)))
    }
}

/// The locale the request actually asked for, `None` when it sent no
/// `Accept-Language`. Separate from [`ReqLocale`], which answers "what do we
/// serve" and so has to name a locale even when nothing was said.
pub struct AskedLocale(pub Option<&'static str>);

impl FromRequestParts<SharedState> for AskedLocale {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let asked = parts
            .headers
            .get(axum::http::header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok())
            .map(|h| detect_locale(None, Some(h)));
        Ok(AskedLocale(asked))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_matches_built_engine() {
        let e = i18n();
        assert_eq!(e.default_locale(), DEFAULT_LOCALE);
        let mut supported = e.supported().collect::<Vec<_>>();
        supported.sort_unstable();
        assert_eq!(supported, SUPPORTED_LOCALES.to_vec());
        assert!(SUPPORTED_LOCALES.contains(&DEFAULT_LOCALE));
        assert_eq!(
            t("fr", "content.seasonCount", &[("count", "1")]),
            "1 saison"
        );
        assert_eq!(
            t("fr", "content.seasonCount", &[("count", "2")]),
            "2 saisons"
        );
        assert_eq!(
            t("en", "content.seasonCount", &[("count", "1")]),
            "1 season"
        );
        assert_eq!(normalize("en-US"), Some("en"));
    }

    #[test]
    fn the_lazy_namespaces_of_the_clients_are_eager_here() {
        assert_ne!(t("fr", "admin.noAdminAccess", &[]), "admin.noAdminAccess");
    }

    #[test]
    fn the_schema_pointer_is_not_a_message() {
        assert!(!is_message_key("$schema"));
        assert!(is_message_key("nav.home"));
    }

    #[test]
    fn the_plural_rule_reads_a_tag_the_way_the_catalog_lookup_does() {
        for tag in ["fr", "FR", "fr-CH", "Français"] {
            assert_eq!(
                t(tag, "content.seasonCount", &[("count", "0")]),
                "0 saison",
                "{tag}"
            );
        }
        assert_eq!(
            t("en-US", "content.seasonCount", &[("count", "0")]),
            "0 seasons"
        );
    }

    #[test]
    fn zero_pluralizes_the_way_intl_pluralrules_does_on_the_clients() {
        assert_eq!(
            t("fr", "content.seasonCount", &[("count", "0")]),
            "0 saison"
        );
        assert_eq!(
            t("en", "content.seasonCount", &[("count", "0")]),
            "0 seasons"
        );
    }
}
