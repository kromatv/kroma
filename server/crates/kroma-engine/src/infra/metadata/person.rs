//! TMDB *person* lookup: the biography and life facts behind a name in a title's
//! cast or crew, for the person page.
//!
//! A person is not a library entity there is no row to enrich, and the name is
//! all a credit carries so this resolves by name on demand: `search/person` for
//! the id, then `person/{id}` for the profile. Same curl/JSON transport as the
//! sibling [`super::client`].
//!
//! Two behaviours are worth knowing about:
//!
//! * **The cache is the point.** Every visit to a person page would otherwise
//!   cost two TMDB round trips, and the answer changes about as often as a
//!   birthday does. A cached `None` ("looked up, nobody by that name") is kept
//!   too, so an unknown extra doesn't re-hit the provider on every render.
//! * **Biographies fall back to English.** TMDB translates a fraction of them;
//!   an empty localized biography with an English one available reads as "we
//!   know nothing about this person", which is worse than reading it in English.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;

use kroma_domain::PersonDetail;

use super::client::{curl_json, API, IMG};

/// Process-wide memo of resolved people, keyed by `language|lowercased name`.
/// Deliberately a module static rather than a field on the app state: it holds
/// no configuration and no per-install data, exactly like the DNS cache under
/// `curl` (the sibling [`super::cache::Cache`] hangs off the state only because
/// the admin "reset metadata" action clears it; a stale birthday is harmless).
static CACHE: OnceLock<Mutex<HashMap<String, Option<PersonDetail>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Option<PersonDetail>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The person TMDB knows under `name`, or `None` when nobody matches (or the
/// provider is unreachable a miss no worse than an absent biography).
///
/// Blocking: shells out to `curl` twice on a cache miss. Call it from a blocking
/// context, never straight off the async runtime.
pub fn detail(api_key: &str, language: &str, name: &str) -> Option<PersonDetail> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    let key = format!("{language}|{}", name.to_lowercase());
    if let Some(hit) = cache().lock().ok().and_then(|c| c.get(&key).cloned()) {
        return hit;
    }
    let resolved = resolve(api_key, language, name);
    if let Ok(mut c) = cache().lock() {
        c.insert(key, resolved.clone());
    }
    resolved
}

/// Cache-free resolve: find the id, fetch the profile, fill an empty biography
/// from English.
fn resolve(api_key: &str, language: &str, name: &str) -> Option<PersonDetail> {
    let id = best_id(api_key, language, name)?;
    let mut person = profile(api_key, language, id)?;
    if person.biography.is_none() && !language.starts_with("en") {
        person.biography = profile(api_key, "en-US", id).and_then(|p| p.biography);
    }
    Some(person)
}

/// The TMDB id for `name`. TMDB orders `search/person` by popularity, which is
/// the right tie-break between two actors of the same name but the wrong answer
/// when a more famous person merely *contains* the query, so an exact
/// (case-insensitive) name match always wins first.
fn best_id(api_key: &str, language: &str, name: &str) -> Option<u64> {
    let params =
        [("language", language.to_string()), ("query", name.to_string()), ("include_adult", "false".to_string())];
    let page: SearchResp = curl_json(&format!("{API}/search/person"), api_key, &params).ok()?;
    let exact = page.results.iter().find(|r| r.name.eq_ignore_ascii_case(name));
    exact.or_else(|| page.results.first()).map(|r| r.id)
}

/// `GET /person/{id}` mapped to the wire type. Blank strings are TMDB's way of
/// saying "unknown", so they are normalized to `None` here rather than at every
/// call site.
fn profile(api_key: &str, language: &str, id: u64) -> Option<PersonDetail> {
    let params = [("language", language.to_string())];
    let raw: RawPerson = curl_json(&format!("{API}/person/{id}"), api_key, &params).ok()?;
    Some(PersonDetail {
        tmdb_id: raw.id,
        name: raw.name,
        biography: text(raw.biography),
        birthday: text(raw.birthday),
        deathday: text(raw.deathday),
        place_of_birth: text(raw.place_of_birth),
        known_for: text(raw.known_for_department),
        profile_url: text(raw.profile_path).map(|p| format!("{IMG}/w342{p}")),
        tmdb_url: format!("https://www.themoviedb.org/person/{id}"),
    })
}

/// `Some(trimmed)` for a field TMDB actually filled in.
fn text(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[derive(Debug, Deserialize)]
struct SearchResp {
    #[serde(default)]
    results: Vec<SearchHit>,
}

#[derive(Debug, Deserialize)]
struct SearchHit {
    id: u64,
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct RawPerson {
    id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    biography: Option<String>,
    #[serde(default)]
    birthday: Option<String>,
    #[serde(default)]
    deathday: Option<String>,
    #[serde(default)]
    place_of_birth: Option<String>,
    #[serde(default)]
    known_for_department: Option<String>,
    #[serde(default)]
    profile_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_provider_fields_become_none() {
        assert_eq!(text(Some("  ".into())), None);
        assert_eq!(text(Some(" Paris, France ".into())), Some("Paris, France".into()));
        assert_eq!(text(None), None);
    }

    #[test]
    fn an_exact_name_beats_a_more_popular_partial_match() {
        let page = SearchResp {
            results: vec![
                SearchHit { id: 1, name: "Ana de Armas Caso".into() },
                SearchHit { id: 2, name: "ana de armas".into() },
            ],
        };
        let name = "Ana de Armas";
        let exact = page.results.iter().find(|r| r.name.eq_ignore_ascii_case(name));
        assert_eq!(exact.map(|r| r.id), Some(2));
    }

    #[test]
    fn a_person_json_maps_onto_the_wire_type() {
        let raw: RawPerson = serde_json::from_str(
            r#"{"id":224513,"name":"Ana de Armas","biography":"","birthday":"1988-04-30",
                "deathday":null,"place_of_birth":"Havana, Cuba","known_for_department":"Acting",
                "profile_path":"/ap.jpg"}"#,
        )
        .expect("valid person JSON");
        assert_eq!(raw.id, 224513);
        assert_eq!(text(raw.biography), None); // empty string, not a biography
        assert_eq!(text(raw.place_of_birth), Some("Havana, Cuba".into()));
        assert_eq!(text(raw.profile_path).map(|p| format!("{IMG}/w342{p}")), Some(format!("{IMG}/w342/ap.jpg")));
    }
}
