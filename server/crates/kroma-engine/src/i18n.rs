//! KROMA's i18n wiring over the generic [`kroma_i18n`] engine: the shared
//! catalogs under `packages/core/src/locales/<locale>/` (the same files the TS
//! clients bundle), gathered by `build.rs` into one list of parts, and the
//! policy `i18n.json` beside them sets: the language they are written in, the
//! ones a reader is offered, and what an unfinished one reads in.

use std::collections::HashMap;
use std::sync::OnceLock;

use kroma_i18n::I18n;

mod content;
mod extract;
mod fill;
mod tag;
mod tmdb;

pub use content::{content_chain, content_keyed, content_locale, content_locales, pick};
pub use extract::{AskedLocale, ContentLocale, ReqLocale};
pub use tag::{canonical, language, nearest, region};
pub use tmdb::tmdb_language;

mod parts {
    include!(concat!(env!("OUT_DIR"), "/catalog_parts.rs"));
}

/// The language the messages are written in: the complete one, which every
/// other falls back to and an unknown reader is served.
pub const DEFAULT_LOCALE: &str = parts::SOURCE;

/// Every language a reader is offered, in folder order: the ones `i18n.json`
/// stages past a draft. A folder is the one place a language is added and its
/// stage the one place it is shipped, so this is read from them.
pub const SUPPORTED_LOCALES: &[&str] = parts::LOCALES;

fn parsed(code: &str) -> fill::Catalog {
    let mut catalog = fill::Catalog::new();
    for (_, json) in parts::CATALOG_PARTS.iter().filter(|(of, _)| *of == code) {
        let part: HashMap<String, String> =
            serde_json::from_str(json).expect("a KROMA catalog is a flat string map");
        catalog.extend(part);
    }
    catalog
}

// The catalogs are shared with the TypeScript clients, which select a variant
// through `Intl.PluralRules` and read an unfinished language in its fallbacks.
// The same key has to resolve the same way on both sides, or a notification
// reads differently than the screen that shows it.
fn i18n() -> &'static I18n {
    static ENGINE: OnceLock<I18n> = OnceLock::new();
    ENGINE.get_or_init(|| {
        let mut builder = parts::CATALOG_PARTS.iter().fold(
            I18n::builder()
                .default_locale(DEFAULT_LOCALE)
                .plural_rule(kroma_i18n::cldr),
            |builder, (code, json)| builder.catalog_json(*code, *json),
        );
        for (code, chain) in parts::FALLBACKS {
            let fallbacks: Vec<fill::Catalog> = chain.iter().map(|other| parsed(other)).collect();
            let gaps = fill::gaps(&parsed(code), &fallbacks.iter().collect::<Vec<_>>());
            builder = builder.catalog(*code, gaps);
        }
        builder.build().expect("KROMA i18n catalogs")
    })
}

/// Translate `key` in `locale`, falling back to [`DEFAULT_LOCALE`] then the raw
/// key. A numeric `count` var selects a CLDR plural variant.
pub fn t(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    i18n().t(locale, key, vars)
}

/// Map a BCP-47 tag or native display name to a supported locale, or `None`.
/// The tag is read however it is spelled (`fr-ch`, `PT_br`), and a Chinese one
/// given by region (`zh-TW`) names the script it writes in.
pub fn normalize(tag: &str) -> Option<&'static str> {
    content::REAL
        .resolve(tag)
        .or_else(|| i18n().normalize_locale(tag))
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

/// Best locale from an explicit preference and/or an `Accept-Language` header:
/// the preference, else the first entry of the header that [`normalize`] reads.
pub fn detect_locale(preferred: Option<&str>, accept_language: Option<&str>) -> &'static str {
    let listed = |header: &str| {
        header
            .split(',')
            .filter_map(|entry| entry.split(';').next())
            .find_map(normalize)
    };
    preferred
        .and_then(normalize)
        .or_else(|| accept_language.and_then(listed))
        .unwrap_or(DEFAULT_LOCALE)
}

#[cfg(test)]
mod policy;

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
    fn a_tag_is_read_however_it_is_spelled() {
        assert_eq!(normalize("FR"), Some("fr"));
        assert_eq!(normalize("en_us"), Some("en"));
        assert_eq!(normalize("Français"), Some("fr"));
        assert_eq!(normalize("xx"), None);
    }

    #[test]
    fn the_first_entry_of_a_header_that_is_offered_is_the_locale_detected() {
        let header = Some("de;q=0.9, en-US;q=0.8, fr;q=0.5");

        assert_eq!(detect_locale(None, header), "en");
        assert_eq!(detect_locale(Some("fr_FR"), header), "fr");
        assert_eq!(detect_locale(None, Some("de")), DEFAULT_LOCALE);
        assert_eq!(detect_locale(None, None), DEFAULT_LOCALE);
    }

    #[test]
    fn every_offered_language_is_past_a_draft_and_the_source_is_among_them() {
        let policy = policy::Policy::parse(include_str!(
            "../../../../packages/core/src/locales/i18n.json"
        ))
        .expect("the policy file parses");

        assert_eq!(policy.source, DEFAULT_LOCALE);
        assert!(SUPPORTED_LOCALES.iter().all(|code| policy.offered(code)));
    }

    #[test]
    fn a_policy_names_the_stage_of_a_folder_and_drafts_the_rest() {
        let policy = policy::Policy::parse(
            r#"{ "source": "fr", "locales": { "en": { "stage": "stable" }, "de": { "stage": "beta" } } }"#,
        )
        .expect("a valid policy");

        assert_eq!(policy.stage("fr"), policy::Stage::Stable);
        assert_eq!(policy.stage("de"), policy::Stage::Beta);
        assert_eq!(policy.stage("it"), policy::Stage::Draft);
        assert!(policy.offered("de") && !policy.offered("it"));
    }

    #[test]
    fn a_locale_falls_back_to_its_language_then_the_project_fallback_then_the_source() {
        let policy = policy::Policy::parse(r#"{ "source": "fr", "fallback": "en" }"#)
            .expect("a valid policy");

        let chain = policy.chain("pt-BR", &|code| ["pt-BR", "pt", "en", "fr"].contains(&code));

        assert_eq!(chain, ["pt-BR", "pt", "en", "fr"]);
    }

    #[test]
    fn a_named_fallback_replaces_the_language_and_a_missing_folder_is_skipped() {
        let policy = policy::Policy::parse(
            r#"{ "source": "fr", "fallback": "en", "locales": { "gsw": { "fallback": "de" } } }"#,
        )
        .expect("a valid policy");

        let chain = policy.chain("gsw", &|code| ["gsw", "de", "fr"].contains(&code));

        assert_eq!(chain, ["gsw", "de", "fr"]);
    }

    #[test]
    fn a_policy_with_an_unknown_stage_is_refused_by_name() {
        let refused = policy::Policy::parse(
            r#"{ "source": "fr", "locales": { "de": { "stage": "live" } } }"#,
        );

        assert!(refused.is_err_and(|why| why.contains("live") && why.contains("de")));
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
        for tag in ["fr", "FR", "fr-CH", "French"] {
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
