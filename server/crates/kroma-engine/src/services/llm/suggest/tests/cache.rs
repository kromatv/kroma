use std::collections::HashMap;

use super::super::*;
use super::{reply, seeded};
use crate::db::{self, SuggestionRow};
use crate::i18n;
use crate::state::SharedState;
use crate::test_support::FakeLlm;

const MEMBERS: [&str; 4] = ["itm-1", "itm-2", "itm-3", "itm-4"];
const REFUSAL: &str = "I'd rather not.";

fn cache_asked_for(state: &SharedState, asked: &[&str]) {
    let ids: Vec<String> = MEMBERS.iter().map(ToString::to_string).collect();
    let reasons = HashMap::from([("en".to_string(), "Because.".to_string())]);
    db::set_suggestion(&state.db, "itm-0", &ids, &reasons, asked).unwrap();
}

fn cached(state: &SharedState) -> SuggestionRow {
    db::get_suggestion(&state.db, "itm-0").unwrap().unwrap()
}

#[test]
fn a_row_asked_for_other_languages_is_regenerated_once_and_then_lists_the_readers() {
    let state = seeded();
    cache_asked_for(&state, &["en", "fr"]);
    let llm = FakeLlm::always(&reply(&MEMBERS));
    llm.configure(&state);
    let missed = !covers(&cached(&state), "de");

    regenerate(&state, "itm-0", 512, &["en", "fr", "de"]).unwrap();

    assert!(missed);
    assert!(covers(&cached(&state), "de"));
    assert!(!cached(&state).reasons.contains_key("de"));
    assert_eq!(llm.requests().len(), 1);
}

#[test]
fn a_row_written_before_the_record_answers_the_two_languages_that_existed() {
    let state = seeded();
    let conn = state.db.get().unwrap();
    conn.execute(
        "INSERT INTO item_suggestions (item_id, item_ids, updated_at) VALUES ('itm-0', '[]', 0)",
        [],
    )
    .unwrap();

    let row = cached(&state);

    assert!(covers(&row, "en"));
    assert!(covers(&row, "fr"));
    assert!(!covers(&row, "de"));
}

#[test]
fn a_reader_of_a_regional_locale_is_answered_by_a_row_asked_for_its_language() {
    let state = seeded();
    cache_asked_for(&state, &["fr"]);

    let row = cached(&state);

    assert!(covers(&row, i18n::content_locale("fr-CH")));
    assert!(!covers(&row, "fr-CH"));
}

#[test]
fn a_regeneration_that_fails_leaves_the_row_and_its_record_as_they_were() {
    let state = seeded();
    cache_asked_for(&state, &["en", "fr"]);
    FakeLlm::failing(500).configure(&state);

    let outcome = regenerate(&state, "itm-0", 512, &["en", "fr", "de"]);

    let row = cached(&state);
    assert!(outcome.is_err());
    assert_eq!(row.item_ids, MEMBERS);
    assert_eq!(row.reasons["en"], "Because.");
    assert_eq!(row.asked_locales, ["en", "fr"]);
}

#[test]
fn a_regeneration_that_comes_back_empty_keeps_the_row_and_records_what_was_asked() {
    let state = seeded();
    cache_asked_for(&state, &["en", "fr"]);
    FakeLlm::always(REFUSAL).configure(&state);

    regenerate(&state, "itm-0", 512, &["en", "fr", "de"]).unwrap();

    let row = cached(&state);
    assert_eq!(row.item_ids, MEMBERS);
    assert_eq!(row.reasons["en"], "Because.");
    assert!(covers(&row, "de"));
}

#[test]
fn a_first_generation_that_comes_back_empty_caches_a_terminal_row_with_its_record() {
    let state = seeded();
    FakeLlm::always(REFUSAL).configure(&state);

    regenerate(&state, "itm-0", 512, &["en", "fr"]).unwrap();

    let row = cached(&state);
    assert!(row.item_ids.is_empty());
    assert_eq!(row.asked_locales, ["en", "fr"]);
}
