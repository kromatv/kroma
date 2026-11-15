use super::super::*;
use super::{reply, seeded};
use crate::test_support::FakeLlm;

#[test]
fn without_a_tool_calling_model_there_is_nothing_to_suggest() {
    // The model browses the catalogue through tools; without them it can
    // only invent titles, so the feature declines rather than guessing.
    let state = seeded();
    assert!(suggest_for(&state, "itm-0", 512).unwrap().is_none());
}

#[test]
fn an_unknown_seed_is_not_an_error() {
    // The API caches `None` as terminal, and a deleted title should simply
    // have no suggestions rather than retry forever.
    let state = seeded();
    let llm = FakeLlm::always(&reply(&["itm-1", "itm-2", "itm-3", "itm-4"]));
    llm.configure(&state);
    assert!(suggest_for(&state, "does-not-exist", 512)
        .unwrap()
        .is_none());
    assert!(
        llm.requests().is_empty(),
        "an unknown seed should cost no request"
    );
}

#[test]
fn members_are_resolved_against_the_real_catalogue() {
    let state = seeded();
    let llm = FakeLlm::always(&reply(&["itm-1", "itm-2", "itm-3", "itm-4"]));
    llm.configure(&state);

    let out = suggest_for(&state, "itm-0", 512)
        .unwrap()
        .expect("a suggestion");
    assert_eq!(out.ids, ["itm-1", "itm-2", "itm-3", "itm-4"]);
    assert_eq!(
        out.reasons.get("en").map(String::as_str),
        Some("Because they rhyme.")
    );
}

#[test]
fn the_seed_itself_and_repeats_are_dropped_before_counting() {
    // "More like this" that includes THIS is noise, and a model that repeats
    // a title must not use it to clear the minimum twice.
    let state = seeded();
    let llm = FakeLlm::always(&reply(&[
        "itm-0", "itm-1", "itm-1", "itm-2", "itm-3", "itm-4", " itm-4 ", "",
    ]));
    llm.configure(&state);

    let out = suggest_for(&state, "itm-0", 512)
        .unwrap()
        .expect("a suggestion");
    assert_eq!(out.ids, ["itm-1", "itm-2", "itm-3", "itm-4"]);
}

#[test]
fn ids_the_model_invented_do_not_count_toward_the_minimum() {
    // The trap this gate exists for: four claimed members pass a raw count,
    // get cached as terminal, and then vanish at hydration - leaving the
    // rail permanently empty with no error anywhere. The count is taken
    // AFTER resolving against the catalogue.
    let state = seeded();
    let llm = FakeLlm::always(&reply(&["itm-1", "itm-2", "nope-1", "nope-2"]));
    llm.configure(&state);

    assert!(suggest_for(&state, "itm-0", 512).unwrap().is_none());
}

#[test]
fn a_reply_too_thin_to_be_a_rail_is_declined() {
    let state = seeded();
    let llm = FakeLlm::always(&reply(&["itm-1", "itm-2", "itm-3"]));
    llm.configure(&state);
    assert!(suggest_for(&state, "itm-0", 512).unwrap().is_none());
    const { assert!(MIN_MEMBERS > 3) };
}

#[test]
fn a_reply_that_is_not_json_is_declined_rather_than_failing() {
    // `Err` makes the caller retry; an unusable reply is a terminal
    // "nothing", not a transient failure.
    let state = seeded();
    let llm = FakeLlm::always("I'd rather not.");
    llm.configure(&state);
    assert!(suggest_for(&state, "itm-0", 512).unwrap().is_none());
}

#[test]
fn a_blank_reason_is_dropped_rather_than_shown_empty() {
    let state = seeded();
    let llm = FakeLlm::always(
        r#"{"reason":{"en":"   ","fr":"Parce que."},"members":["itm-1","itm-2","itm-3","itm-4"]}"#,
    );
    llm.configure(&state);

    let out = suggest_for(&state, "itm-0", 512)
        .unwrap()
        .expect("a suggestion");
    assert!(
        !out.reasons.contains_key("en"),
        "an empty reason reached the UI"
    );
    assert_eq!(
        out.reasons.get("fr").map(String::as_str),
        Some("Parce que.")
    );
}

#[test]
fn a_reason_the_model_keyed_loosely_is_stored_under_the_locale_it_names() {
    let state = seeded();
    let llm = FakeLlm::always(
        r#"{"reason":{"EN":"Because.","fr_FR":"Parce que.","xx":"?"},"members":["itm-1","itm-2","itm-3","itm-4"]}"#,
    );
    llm.configure(&state);

    let out = suggest_for(&state, "itm-0", 512)
        .unwrap()
        .expect("a suggestion");

    let mut keys: Vec<&str> = out.reasons.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["en", "fr"]);
    assert_eq!(out.reasons["fr"], "Parce que.");
}
