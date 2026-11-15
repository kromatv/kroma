//! The tag a locale's content is asked for at TMDB.

use std::borrow::Cow;

use super::tag;

/// The tag TMDB is asked for a locale's content in.
// TMDB's `language` is an ISO 639-1 code with an ISO 3166-1 country, and its
// translations carry no script: Chinese is `zh-CN`, `zh-HK`, `zh-SG`, `zh-TW`.
// https://developer.themoviedb.org/docs/languages
// https://developer.themoviedb.org/reference/configuration-primary-translations
pub fn tmdb_language(locale: &str) -> Cow<'_, str> {
    if tag::script(locale).is_none() {
        return Cow::Borrowed(locale);
    }
    let spelled = tag::canonical(locale);
    let language = tag::language(&spelled);
    let written_in = match (language, tag::script(&spelled)) {
        ("zh", Some("Hant")) => Some("TW"),
        ("zh", Some("Hans")) => Some("CN"),
        _ => None,
    };
    Cow::Owned(match tag::region(&spelled).or(written_in) {
        Some(region) => format!("{language}-{region}"),
        None => language.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tmdb_is_asked_for_a_locale_as_it_is_spelled() {
        assert_eq!(tmdb_language("fr"), "fr");
        assert_eq!(tmdb_language("en"), "en");
        assert_eq!(tmdb_language("pt-BR"), "pt-BR");
    }

    #[test]
    fn tmdb_is_asked_for_a_chinese_script_by_the_region_that_writes_it() {
        assert_eq!(tmdb_language("zh-Hant"), "zh-TW");
        assert_eq!(tmdb_language("zh-Hans"), "zh-CN");
        assert_eq!(tmdb_language("zh-Hant-HK"), "zh-HK");
    }

    #[test]
    fn tmdb_is_never_sent_a_script() {
        assert_eq!(tmdb_language("sr-Latn"), "sr");
        assert_eq!(tmdb_language("sr_latn_rs"), "sr-RS");
    }
}
