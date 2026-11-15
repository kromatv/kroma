//! The words a language uses for the things the server has to recognise in
//! text: a query that says "season 2", a synopsis that says "Christmas".
//!
//! They live in the `vocab.*` copy of every language's catalog, beside the
//! strings the app shows, and are read here across EVERY language the app
//! ships. Recognition never depends on which language a household enriched in
//! or a viewer typed in, and a new language brings its own words by adding its
//! catalog: nothing in this crate lists a language.

use crate::i18n;

fn said_in(locale: &str, key: &str) -> Vec<String> {
    if !i18n::is_message_key(key) {
        return Vec::new();
    }
    i18n::t(locale, key, &[])
        .split(',')
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// Every word any language lists under `key`, each once.
pub fn words(key: &str) -> Vec<String> {
    let mut all: Vec<String> = Vec::new();
    for word in by_language(key).into_iter().flatten() {
        if !all.contains(&word) {
            all.push(word);
        }
    }
    all
}

/// The words under `key` language by language, for a list whose ORDER carries
/// meaning: the number words run from two to ten in each.
pub fn by_language(key: &str) -> Vec<Vec<String>> {
    let mut lists: Vec<Vec<String>> = Vec::new();
    for locale in i18n::SUPPORTED_LOCALES {
        let list = said_in(locale, key);
        if !list.is_empty() && !lists.contains(&list) {
            lists.push(list);
        }
    }
    lists
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_vocabulary_holds_the_words_of_every_language() {
        let seasons = words("vocab.season");

        assert!(seasons.contains(&"season".to_string()));
        assert!(seasons.contains(&"saison".to_string()));
    }

    #[test]
    fn a_word_two_languages_share_is_listed_once() {
        let films = words("vocab.movie");

        assert_eq!(films.iter().filter(|word| *word == "film").count(), 1);
    }

    #[test]
    fn an_ordered_vocabulary_keeps_each_language_s_own_order() {
        let numbers = by_language("vocab.numbers");

        assert!(numbers.iter().any(|list| list.first().map(String::as_str) == Some("two")));
        assert!(numbers.iter().any(|list| list.first().map(String::as_str) == Some("deux")));
        assert!(numbers.iter().all(|list| list.len() == 9));
    }

    #[test]
    fn a_phrase_stays_whole() {
        assert!(words("vocab.theme.christmas").contains(&"père noël".to_string()));
    }

    #[test]
    fn a_key_no_catalog_carries_says_nothing() {
        assert!(words("vocab.nothing").is_empty());
        assert!(by_language("vocab.nothing").is_empty());
    }

    #[test]
    fn no_vocabulary_the_server_reads_is_empty() {
        for key in [
            "vocab.season",
            "vocab.episode",
            "vocab.movie",
            "vocab.show",
            "vocab.articles",
            "vocab.numbers",
            "vocab.theme.christmas",
            "vocab.theme.heist",
            "vocab.theme.summer",
            "vocab.theme.trueStory",
        ] {
            assert!(!words(key).is_empty(), "{key} says nothing");
        }
    }
}
