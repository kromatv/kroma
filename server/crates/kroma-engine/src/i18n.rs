//! KROMA's i18n wiring over the generic [`kroma_i18n`] engine: the default
//! locale, the supported set, and the shared catalogs in
//! `packages/core/src/locales` (the same files the TS clients bundle).

use std::convert::Infallible;
use std::sync::OnceLock;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use kroma_i18n::I18n;

use crate::state::SharedState;

pub const DEFAULT_LOCALE: &str = "fr";

pub const SUPPORTED_LOCALES: &[&str] = &["fr", "en"];

// Path anchored to this crate's manifest dir, so `../../../` reaches the repo root.
macro_rules! catalog {
    ($code:literal) => {
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/core/src/locales/",
            $code,
            ".json"
        ))
    };
}

fn i18n() -> &'static I18n {
    static ENGINE: OnceLock<I18n> = OnceLock::new();
    ENGINE.get_or_init(|| {
        I18n::builder()
            .default_locale(DEFAULT_LOCALE)
            .catalog_json("fr", catalog!("fr"))
            .catalog_json("en", catalog!("en"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_matches_built_engine() {
        let e = i18n();
        assert_eq!(e.default_locale(), DEFAULT_LOCALE);
        assert_eq!(
            e.supported().collect::<Vec<_>>(),
            SUPPORTED_LOCALES.to_vec()
        );
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
}
