use crate::{cldr, BuildError, I18n};

/// An engine over `catalogs`, as `(locale, json)` pairs, with CLDR plurals. It
/// falls back to `preferred` where that is among them and to the first catalog
/// otherwise; none at all is an error rather than an engine answering every key
/// with itself.
pub fn from_catalogs(preferred: &str, catalogs: &[(&str, &str)]) -> Result<I18n, BuildError> {
    let fallback = catalogs
        .iter()
        .map(|(code, _)| *code)
        .find(|code| *code == preferred)
        .or_else(|| catalogs.first().map(|(code, _)| *code))
        .unwrap_or(preferred);
    catalogs
        .iter()
        .fold(
            I18n::builder().default_locale(fallback).plural_rule(cldr),
            |builder, (code, json)| builder.catalog_json(*code, *json),
        )
        .build()
}
