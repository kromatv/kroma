//! Per-title **AI suggestions** for the detail page: hand the model the seed
//! title's data + the catalog connector and let it pick library titles a fan
//! would enjoy, returning resolved member ids. The API caches the result
//! (`db::item_suggestions`); this is just the generation logic.

use std::collections::HashMap;

use anyhow::Result;
use serde::Deserialize;

use crate::db::TitleFull;
use crate::i18n;
use crate::infra::llm::ToolBox;
use crate::services::llm::CatalogTools;
use crate::state::SharedState;

/// Max model turns in the suggestion tool loop (a few `find_titles`, then the
/// JSON reply smaller than curate's catalog-wide pass).
const MAX_TOOL_STEPS: usize = 12;
/// Minimum members for a suggestion section to be worth showing.
const MIN_MEMBERS: usize = 4;

/// A generated suggestion: a localized one-line reason per language + resolved
/// member ids.
pub struct Suggestion {
    pub reasons: HashMap<String, String>,
    pub ids: Vec<String>,
}

/// Generate AI suggestions for one seed item. `Ok(Some)` on success; `Ok(None)`
/// when the LLM is unconfigured / can't tool-call, the seed is unknown, or the
/// reply was unusable / too thin; `Err` only on a hard LLM failure so the
/// caller can cache `None` as a terminal "nothing" but retry on `Err`.
pub fn suggest_for(state: &SharedState, seed_id: &str, max_tokens: u32) -> Result<Option<Suggestion>> {
    let pool = &state.db;
    let Some(seed) = crate::db::get_title(pool, seed_id)? else {
        return Ok(None);
    };
    let llm = crate::infra::llm::from_settings(&state.settings);
    if !llm.available() || !llm.supports_tools() {
        return Ok(None); // needs tool calling to browse the catalog
    }

    let (system, user) = build_prompt(&seed);
    let tools = CatalogTools::new(pool.clone(), None);
    let reply = llm.run_tools(&system, &user, &tools.defs(), &tools, max_tokens, MAX_TOOL_STEPS)?;

    let Some(spec) = parse(&reply) else {
        return Ok(None);
    };
    let mut seen = std::collections::HashSet::new();
    let claimed: Vec<String> = spec
        .members
        .into_iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty() && m != seed_id && seen.insert(m.clone()))
        .collect();
    // Resolve against the real catalog (movies *and* shows) and gate on the
    // resolved count the model can echo titles or stale/invented ids, which
    // would otherwise pass the raw-count gate, get cached as terminal, then be
    // silently dropped at hydration, leaving the rail permanently empty.
    let refs: Vec<&str> = claimed.iter().map(String::as_str).collect();
    let ids: Vec<String> =
        crate::db::entities_by_ids(pool, &refs)?.iter().map(|e| e.id().to_string()).collect();
    if ids.len() < MIN_MEMBERS {
        return Ok(None);
    }
    let reasons = spec
        .reason
        .into_iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(k, v)| (k, v.trim().to_string()))
        .collect();
    Ok(Some(Suggestion { reasons, ids }))
}

/// (system, user) prompt: describe the seed, ask for library titles a fan would
/// enjoy, members returned as catalog ids from the tools.
fn build_prompt(s: &TitleFull) -> (String, String) {
    let reason_fields =
        i18n::SUPPORTED_LOCALES.iter().map(|l| format!("\"{l}\":string")).collect::<Vec<_>>().join(",");
    let codes = i18n::SUPPORTED_LOCALES.join(", ");
    let system = format!(
        "You are the resident film & TV concierge of a personal library. Given one title the viewer \
         is looking at, suggest OTHER titles from this library a fan of it would enjoy same director \
         or cast, kindred genre, era or mood. You have tools: list_genres, list_people, find_titles \
         (filter by genre / director / actor / year / rating) and get_title. Use find_titles to gather \
         candidates (try the seed's director, its lead actors, and its genres).\n\
         When done, reply with STRICT JSON only no prose, no markdown, no fences:\n\
         {{\"reason\":{{{reason_fields}}},\"members\":[string]}}\n\
         - \"members\": 8-15 catalog **ids** returned by the tools (each title's \"id\" field), \
         excluding the seed; never invent ids.\n\
         - \"reason\" is an object keyed by language code ({codes}) provide every listed language, \
         ONE short clause each on what ties them to the seed."
    );
    let directors = s.directors.join(", ");
    let cast = s.cast.iter().take(5).cloned().collect::<Vec<_>>().join(", ");
    let genres = s.genres.join(", ");
    let overview: String = s.overview.as_deref().unwrap_or("").chars().take(280).collect();
    let dash = |s: &str| if s.trim().is_empty() { "-".to_string() } else { s.to_string() };
    let user = format!(
        "Seed (id {}): \"{}\"{}\n- genres: {}\n- director: {}\n- cast: {}\n- synopsis: {}\n\n\
         Suggest library titles a fan of this would enjoy. Return the JSON now.",
        s.id,
        s.title,
        s.year.map(|y| format!(" ({y})")).unwrap_or_default(),
        dash(&genres),
        dash(&directors),
        dash(&cast),
        dash(&overview),
    );
    (system, user)
}

/// One suggestion object as the model returned it. `reason` is a locale-keyed
/// object (`{"en":…,"fr":…}`) over the supported languages.
#[derive(Deserialize, Default)]
#[serde(default)]
struct Spec {
    reason: HashMap<String, String>,
    members: Vec<String>,
}

/// Parse the outermost JSON object from a (possibly fenced / prefixed) reply.
fn parse(text: &str) -> Option<Spec> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str(&text[start..=end]).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

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
        for locale in i18n::SUPPORTED_LOCALES {
            assert!(system.contains(&format!("\"{locale}\":string")), "{locale} missing:\n{system}");
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
        assert!(user.contains("Stellan Skarsgård"), "the fifth name is included");
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
        assert_eq!(spec.reason.get("en").map(String::as_str), Some("Same director."));
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
}
