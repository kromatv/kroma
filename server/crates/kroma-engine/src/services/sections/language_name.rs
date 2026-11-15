//! The English name a prompt gives a language.

use crate::i18n;

const NAMES: &[(&str, &str)] = &[
    ("ar", "Arabic"),
    ("ca", "Catalan"),
    ("cs", "Czech"),
    ("da", "Danish"),
    ("de", "German"),
    ("el", "Greek"),
    ("en", "English"),
    ("es", "Spanish"),
    ("fi", "Finnish"),
    ("fr", "French"),
    ("he", "Hebrew"),
    ("hi", "Hindi"),
    ("hu", "Hungarian"),
    ("id", "Indonesian"),
    ("it", "Italian"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("nb", "Norwegian Bokmål"),
    ("nl", "Dutch"),
    ("pl", "Polish"),
    ("pt", "Portuguese"),
    ("pt-BR", "Brazilian Portuguese"),
    ("pt-PT", "European Portuguese"),
    ("ro", "Romanian"),
    ("ru", "Russian"),
    ("sv", "Swedish"),
    ("th", "Thai"),
    ("tr", "Turkish"),
    ("uk", "Ukrainian"),
    ("vi", "Vietnamese"),
    ("zh", "Chinese"),
    ("zh-Hans", "Simplified Chinese"),
    ("zh-Hant", "Traditional Chinese"),
];

// A model reads a BCP 47 tag, so a locale with no name here is still told
// apart by its tag: beside its language's name, or alone.
pub(super) fn language_name(locale: &str) -> String {
    let named = |tag: &str| NAMES.iter().find(|(code, _)| *code == tag);
    match (named(locale), named(i18n::language(locale))) {
        (Some((_, name)), _) => (*name).to_owned(),
        (None, Some((_, language))) => format!("{language} ({locale})"),
        (None, None) => locale.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_language_is_told_by_its_english_name() {
        assert_eq!(language_name("fr"), "French");
        assert_eq!(language_name("en"), "English");
        assert_eq!(language_name("de"), "German");
    }

    #[test]
    fn a_regional_or_script_locale_with_a_name_of_its_own_is_told_by_it() {
        assert_eq!(language_name("pt-BR"), "Brazilian Portuguese");
        assert_eq!(language_name("zh-Hant"), "Traditional Chinese");
    }

    #[test]
    fn a_region_with_no_name_of_its_own_is_told_by_its_language_and_its_tag() {
        assert_eq!(language_name("fr-CH"), "French (fr-CH)");
    }

    #[test]
    fn a_language_with_no_name_here_is_told_by_its_tag() {
        assert_eq!(language_name("gsw"), "gsw");
    }
}
