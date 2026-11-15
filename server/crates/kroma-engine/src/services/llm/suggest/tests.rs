use super::*;
use crate::test_support::{seed_movie, test_state};

mod cache;
mod runs;

// A model reply in the shape `parse` expects.
fn reply(members: &[&str]) -> String {
    let list = members
        .iter()
        .map(|m| format!("\"{m}\""))
        .collect::<Vec<_>>()
        .join(",");
    format!(r#"{{"reason":{{"en":"Because they rhyme."}},"members":[{list}]}}"#)
}

fn seeded() -> crate::state::SharedState {
    let state = test_state();
    for n in 0..8 {
        seed_movie(&state, &format!("itm-{n}"));
    }
    state
}

fn seed() -> TitleFull {
    TitleFull {
        id: "itm_dune".into(),
        title: "Dune".into(),
        year: Some(2021),
        kind: "movie".into(),
        rating: Some(8.0),
        genres: vec!["Science Fiction".into(), "Adventure".into()],
        directors: vec!["Denis Villeneuve".into()],
        cast: vec![
            "Timothée Chalamet".into(),
            "Rebecca Ferguson".into(),
            "Oscar Isaac".into(),
            "Josh Brolin".into(),
            "Stellan Skarsgård".into(),
            "Zendaya".into(),
            "Jason Momoa".into(),
        ],
        overview: Some("A noble family becomes embroiled in a war for a desert planet.".into()),
        tagline: None,
    }
}

fn bare() -> TitleFull {
    TitleFull {
        id: "itm_x".into(),
        title: "Untitled".into(),
        year: None,
        kind: "movie".into(),
        rating: None,
        genres: vec![],
        directors: vec![],
        cast: vec![],
        overview: None,
        tagline: None,
    }
}

#[test]
fn asks_for_a_reason_in_every_language_the_app_speaks() {
    let (system, _) = build_prompt(&seed());
    // A locale added to the app but missing from the prompt is a rail whose
    // reason line is blank for exactly those users, and nothing else says so.
    for locale in i18n::content_locales() {
        assert!(
            system.contains(&format!("\"{locale}\":string")),
            "{locale} missing:\n{system}"
        );
        assert!(system.contains(locale), "{locale} not listed in the codes");
    }
}

#[test]
fn tells_the_model_to_return_ids_and_never_invent_them() {
    let (system, _) = build_prompt(&seed());
    // The ids are resolved against the catalog afterwards, so an invented one
    // is silently dropped - the instruction is what keeps the count honest.
    assert!(system.contains("never invent ids"));
    assert!(system.contains("excluding the seed"));
    // Strict JSON: the parser tolerates fences, but asking for prose invites
    // a reply with none of the JSON at all.
    assert!(system.contains("STRICT JSON only"));
}

#[test]
fn describes_the_seed_the_model_is_reasoning_about() {
    let (_, user) = build_prompt(&seed());
    assert!(user.contains("itm_dune"));
    assert!(user.contains("\"Dune\""));
    assert!(user.contains("(2021)"));
    assert!(user.contains("Denis Villeneuve"));
    assert!(user.contains("Science Fiction"));
}

#[test]
fn sends_only_the_leading_cast() {
    let (_, user) = build_prompt(&seed());
    // Five names, not the whole call sheet: the rest is prompt budget spent
    // on people nobody chose the film for.
    assert!(
        user.contains("Stellan Skarsgård"),
        "the fifth name is included"
    );
    assert!(!user.contains("Zendaya"), "the sixth is not:\n{user}");
    assert!(!user.contains("Jason Momoa"));
}

#[test]
fn truncates_a_long_synopsis() {
    let mut long = seed();
    long.overview = Some("x".repeat(400));
    let (_, user) = build_prompt(&long);
    // Bounded so one wordy synopsis cannot crowd out the instructions.
    assert!(user.contains(&"x".repeat(280)));
    assert!(!user.contains(&"x".repeat(281)));
}

#[test]
fn counts_characters_rather_than_bytes_when_truncating() {
    let mut accented = seed();
    accented.overview = Some("é".repeat(400));
    // Slicing by byte offset here would panic on a char boundary, taking down
    // the suggestion for any title with an accented synopsis - which in a
    // French library is most of them.
    let (_, user) = build_prompt(&accented);
    assert!(user.contains(&"é".repeat(280)));
}

#[test]
fn writes_a_dash_for_what_the_title_does_not_have() {
    let (_, user) = build_prompt(&bare());
    // An empty field would read as a blank line the model may try to fill.
    assert!(user.contains("- genres: -"), "{user}");
    assert!(user.contains("- director: -"));
    assert!(user.contains("- cast: -"));
    assert!(user.contains("- synopsis: -"));
    // And no year in the title line at all, rather than an empty pair of
    // brackets.
    assert!(user.contains("\"Untitled\"\n"), "{user}");
}

#[test]
fn parses_a_plain_json_reply() {
    let spec = parse(r#"{"reason":{"en":"Same director."},"members":["a","b"]}"#).unwrap();
    assert_eq!(spec.members, vec!["a", "b"]);
    assert_eq!(
        spec.reason.get("en").map(String::as_str),
        Some("Same director.")
    );
}

#[test]
fn parses_a_reply_wrapped_in_prose_or_fences() {
    // Models do this constantly, whatever the prompt says.
    let fenced = "Sure!\n```json\n{\"members\":[\"a\"]}\n```\nHope that helps.";
    assert_eq!(parse(fenced).unwrap().members, vec!["a"]);
}

#[test]
fn takes_the_outermost_object() {
    // The OUTERMOST one: a nested object must not truncate the parse at the
    // first inner `}`.
    let spec = parse(r#"{"reason":{"en":"x","fr":"y"},"members":["a"]}"#).unwrap();
    assert_eq!(spec.reason.len(), 2);
    assert_eq!(spec.members, vec!["a"]);
}

#[test]
fn defaults_the_fields_the_model_left_out() {
    // `#[serde(default)]`: a reply with only one half still parses, and the
    // member gate downstream decides whether it is usable.
    let spec = parse(r#"{"members":["a"]}"#).unwrap();
    assert!(spec.reason.is_empty());
    let spec = parse(r#"{"reason":{"en":"x"}}"#).unwrap();
    assert!(spec.members.is_empty());
}

#[test]
fn refuses_a_reply_with_no_object_in_it() {
    for reply in ["", "no json here", "{ unclosed", "closed }", "} {"] {
        assert!(parse(reply).is_none(), "parsed {reply:?}");
    }
}

#[test]
fn refuses_an_object_that_is_not_valid_json() {
    assert!(parse(r#"{"members": [unquoted]}"#).is_none());
}

#[test]
fn suggests_nothing_for_a_title_that_is_not_in_the_catalog() {
    let state = test_state();
    // Ok(None), not Err: the caller caches a terminal "nothing" on Ok and
    // retries on Err, so a missing seed must not become a permanent retry.
    assert!(suggest_for(&state, "itm_nope", 512).unwrap().is_none());
}
