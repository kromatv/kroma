//! What an unfinished translation reads in. The clients walk a fallback chain
//! per lookup; the engine behind `kroma_i18n` knows one fallback, the default
//! locale, so the gaps of a locale are filled once, at startup, from the chain
//! `i18n.json` gives it.

use std::collections::{HashMap, HashSet};

pub(crate) type Catalog = HashMap<String, String>;

const VARIANTS: [&str; 6] = ["_zero", "_one", "_two", "_few", "_many", "_other"];

// Whether `stem` is a message `messages` writes: as a key of its own, or as a
// plural with no base key, an `_other` and at least one more variant.
fn is_message(stem: &str, messages: &HashSet<&str>) -> bool {
    if messages.contains(stem) {
        return true;
    }
    let written = |suffix: &str| messages.contains(format!("{stem}{suffix}").as_str());
    written("_other") && VARIANTS.iter().filter(|suffix| written(suffix)).count() > 1
}

// The message a key belongs to: itself, or the base it is a plural variant of
// (`item_one` of `item`, `item_seats_one` of `item`). A key is a variant only
// where `messages` has its base, as the clients read it.
fn base_of<'a>(key: &'a str, messages: &HashSet<&str>) -> &'a str {
    let Some(stem) = VARIANTS.iter().find_map(|suffix| key.strip_suffix(suffix)) else {
        return key;
    };
    if is_message(stem, messages) {
        return stem;
    }
    match stem.rfind('_') {
        Some(cut) if messages.contains(&stem[..cut]) => &stem[..cut],
        _ => key,
    }
}

/// The entries `own` lacks, taken from the first of `fallbacks` that has the
/// message. A message comes whole from one language, its plural variants with
/// it, so a count never selects a variant from one language and a template
/// from another.
pub(crate) fn gaps(own: &Catalog, fallbacks: &[&Catalog]) -> Catalog {
    let mut filled = Catalog::new();
    for fallback in fallbacks {
        let messages: HashSet<&str> = fallback.keys().map(String::as_str).collect();
        let answered: HashSet<&str> = own
            .keys()
            .chain(filled.keys())
            .map(|key| base_of(key, &messages))
            .collect();
        let taken: Vec<(String, String)> = fallback
            .iter()
            .filter(|(key, _)| !answered.contains(base_of(key, &messages)))
            .map(|(key, text)| (key.clone(), text.clone()))
            .collect();
        filled.extend(taken);
    }
    filled
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog(entries: &[(&str, &str)]) -> Catalog {
        entries
            .iter()
            .map(|(key, text)| ((*key).to_owned(), (*text).to_owned()))
            .collect()
    }

    #[test]
    fn a_message_the_locale_lacks_comes_from_the_first_fallback_that_has_it() {
        let german = catalog(&[("nav.home", "Start")]);
        let english = catalog(&[("nav.home", "Home"), ("nav.search", "Search")]);
        let french = catalog(&[("nav.search", "Recherche"), ("nav.back", "Retour")]);

        let filled = gaps(&german, &[&english, &french]);

        assert_eq!(
            filled,
            catalog(&[("nav.search", "Search"), ("nav.back", "Retour")])
        );
    }

    #[test]
    fn a_plural_message_comes_whole_from_one_language() {
        let german = catalog(&[]);
        let english = catalog(&[("item", "{count} items"), ("item_one", "{count} item")]);
        let french = catalog(&[
            ("item", "{count} objets"),
            ("item_one", "{count} objet"),
            ("item_zero", "Aucun objet"),
        ]);

        let filled = gaps(&german, &[&english, &french]);

        assert_eq!(filled, english);
    }

    #[test]
    fn a_translated_message_keeps_its_own_variants_and_borrows_none() {
        let russian = catalog(&[("item", "{count} предметов")]);
        let english = catalog(&[("item", "{count} items"), ("item_one", "{count} item")]);

        let filled = gaps(&russian, &[&english]);

        assert_eq!(filled, catalog(&[]));
    }

    #[test]
    fn a_plural_with_no_base_key_is_one_message_too() {
        let german = catalog(&[("videos_other", "{count} Videos")]);
        let english = catalog(&[("videos_one", "{count} video"), ("videos_other", "{count} videos")]);

        let filled = gaps(&german, &[&english]);

        assert_eq!(filled, catalog(&[]));
    }

    #[test]
    fn a_key_that_only_looks_like_a_variant_is_a_message_of_its_own() {
        let german = catalog(&[]);
        let english = catalog(&[("status.kind_other", "Other")]);

        let filled = gaps(&german, &[&english]);

        assert_eq!(filled, english);
    }
}
