use std::collections::HashMap;

use super::super::lang::{primary_lang, stale_langs};
use super::support::state;

fn langs(keys: &[&str]) -> HashMap<String, ()> {
    keys.iter().map(|k| ((*k).to_string(), ())).collect()
}

#[test]
fn primary_lang_prefers_the_households_base_language() {
    let map = langs(&["en", "fr"]);

    assert_eq!(primary_lang(&map, "fr-FR"), "fr");
    assert_eq!(primary_lang(&map, "fr_CA"), "fr");
}

#[test]
fn primary_lang_falls_back_to_english() {
    let map = langs(&["en", "fr"]);

    assert_eq!(primary_lang(&map, "de-DE"), "en");
}

#[test]
fn primary_lang_takes_whatever_is_left_without_english() {
    let map = langs(&["fr"]);

    assert_eq!(primary_lang(&map, "de-DE"), "fr");
}

#[test]
fn primary_lang_of_nothing_is_empty() {
    let map: HashMap<String, ()> = HashMap::new();

    assert_eq!(primary_lang(&map, "en-US"), "");
}

#[test]
fn every_language_is_stale_for_a_title_with_no_translations() {
    let state = state();

    let stale = stale_langs(&state.db, "item", "nobody", &["en", "fr"]);

    assert_eq!(stale, vec!["en".to_string(), "fr".to_string()]);
}
