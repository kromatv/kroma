//! TMDB *person* lookup: the biography and life facts behind a name in a
//! title's cast or crew, for the person page.
//!
//! A person is not a library entity - there is no row to enrich, and the name
//! is all a credit carries - so this resolves by name on demand:
//! `search/person` for the id, then `person/{id}` for the profile.
//!
//! Results are cached indefinitely, including a `None` miss, since the answer
//! changes about as often as a birthday. An empty localized biography falls
//! back to English rather than reading as "we know nothing about this person".

use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;

use kroma_domain::PersonDetail;

use super::client::{api, curl_json, IMG};

/// A single TMDB credit for the filmography fallback.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TmdbCredit {
    #[serde(rename = "tmdbId")]
    pub tmdb_id: u64,
    pub title: String,
    /// "movie" or "tv".
    #[serde(rename = "mediaType")]
    pub media_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "posterUrl")]
    pub poster_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backdropUrl")]
    pub backdrop_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "character")]
    pub character: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "job")]
    pub job: Option<String>,
}

// Deliberately a module static rather than a field on the app state: it holds
// no configuration and no per-install data. Unlike the sibling `Cache`, the
// admin "reset metadata" action does not clear this one; a stale birthday is
// harmless.
static CACHE: OnceLock<Mutex<HashMap<String, Option<PersonDetail>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Option<PersonDetail>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

static CREDITS: OnceLock<Mutex<HashMap<String, Vec<TmdbCredit>>>> = OnceLock::new();

fn credits_cache() -> &'static Mutex<HashMap<String, Vec<TmdbCredit>>> {
    CREDITS.get_or_init(|| Mutex::new(HashMap::new()))
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

/// The person's combined movie + TV credits from TMDB, newest first, with a
/// credit the person appears in twice (cast and crew) kept once as cast.
/// Returns an empty vec when the person or provider is unavailable.
///
/// Blocking: shells out to `curl` twice on a cache miss. Call it from a blocking
/// context, never straight off the async runtime.
pub fn filmography(api_key: &str, language: &str, name: &str) -> Vec<TmdbCredit> {
    let name = name.trim();
    if name.is_empty() {
        return Vec::new();
    }
    let key = format!("{language}|{}", name.to_lowercase());
    if let Some(hit) = credits_cache().lock().ok().and_then(|c| c.get(&key).cloned()) {
        return hit;
    }
    let resolved = resolve_credits(api_key, language, name);
    if let Ok(mut c) = credits_cache().lock() {
        c.insert(key, resolved.clone());
    }
    resolved
}

fn resolve_credits(api_key: &str, language: &str, name: &str) -> Vec<TmdbCredit> {
    let Some(id) = best_id(api_key, language, name) else {
        return Vec::new();
    };
    let params = [("language", language.to_string())];
    let Ok(raw) = curl_json::<CombinedCredits>(
        &format!("{}/person/{id}/combined_credits", api()),
        api_key,
        &params,
    ) else {
        return Vec::new();
    };
    let cast = raw.cast.iter().map(|c| (c, "cast"));
    let crew = raw.crew.iter().map(|c| (c, "crew"));
    let mut seen: HashSet<(u64, &str)> = HashSet::new();
    let mut credits: Vec<TmdbCredit> = Vec::new();
    for (c, role) in cast.chain(crew) {
        if c.media_type != "movie" && c.media_type != "tv" {
            continue;
        }
        if !seen.insert((c.id, c.media_type.as_str())) {
            continue;
        }
        credits.push(credit_from(c, role));
    }
    credits.sort_by_key(|c| Reverse(c.year));
    credits
}

fn credit_from(c: &RawCredit, role: &str) -> TmdbCredit {
    let title = c.title.clone().or_else(|| c.name.clone()).unwrap_or_default();
    let date = c.release_date.as_deref().or(c.first_air_date.as_deref());
    let year = date.and_then(|d| d.get(0..4)).and_then(|y| y.parse::<u32>().ok());
    let poster = c.poster_path.as_deref().map(|p| format!("{IMG}/w185{p}"));
    let backdrop = c.backdrop_path.as_deref().map(|p| format!("{IMG}/w300{p}"));
    let character = if role == "cast" { c.character.clone() } else { None };
    let job = if role == "crew" { c.job.clone() } else { None };
    TmdbCredit {
        tmdb_id: c.id,
        title,
        media_type: c.media_type.clone(),
        year,
        poster_url: poster,
        backdrop_url: backdrop,
        overview: c.overview.clone().filter(|s| !s.is_empty()),
        character,
        job,
    }
}

fn resolve(api_key: &str, language: &str, name: &str) -> Option<PersonDetail> {
    let id = best_id(api_key, language, name)?;
    let mut person = profile(api_key, language, id)?;
    if person.biography.is_none() && !language.starts_with("en") {
        person.biography = profile(api_key, "en-US", id).and_then(|p| p.biography);
    }
    Some(person)
}

// TMDB orders `search/person` by popularity, which is the right tie-break
// between two actors of the same name but the wrong answer when a more
// famous person merely *contains* the query, so an exact (case-insensitive)
// name match always wins first.
fn best_id(api_key: &str, language: &str, name: &str) -> Option<u64> {
    let params = [
        ("language", language.to_string()),
        ("query", name.to_string()),
        ("include_adult", "false".to_string()),
    ];
    let page: SearchResp = curl_json(&format!("{}/search/person", api()), api_key, &params).ok()?;
    let exact = page
        .results
        .iter()
        .find(|r| r.name.eq_ignore_ascii_case(name));
    exact.or_else(|| page.results.first()).map(|r| r.id)
}

// Blank strings are TMDB's way of saying "unknown", so they are normalized to
// `None` here rather than at every call site.
fn profile(api_key: &str, language: &str, id: u64) -> Option<PersonDetail> {
    let params = [("language", language.to_string())];
    let raw: RawPerson = curl_json(&format!("{}/person/{id}", api()), api_key, &params).ok()?;
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

fn text(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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

#[derive(Debug, Deserialize)]
struct CombinedCredits {
    #[serde(default)]
    cast: Vec<RawCredit>,
    #[serde(default)]
    crew: Vec<RawCredit>,
}

#[derive(Debug, Deserialize)]
struct RawCredit {
    id: u64,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, rename = "media_type")]
    media_type: String,
    #[serde(default)]
    character: Option<String>,
    #[serde(default)]
    job: Option<String>,
    #[serde(default, rename = "release_date")]
    release_date: Option<String>,
    #[serde(default, rename = "first_air_date")]
    first_air_date: Option<String>,
    #[serde(default)]
    overview: Option<String>,
    #[serde(default, rename = "poster_path")]
    poster_path: Option<String>,
    #[serde(default, rename = "backdrop_path")]
    backdrop_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_provider_fields_become_none() {
        assert_eq!(text(Some("  ".into())), None);
        assert_eq!(
            text(Some(" Paris, France ".into())),
            Some("Paris, France".into())
        );
        assert_eq!(text(None), None);
    }

    #[test]
    fn an_exact_name_beats_a_more_popular_partial_match() {
        let page = SearchResp {
            results: vec![
                SearchHit {
                    id: 1,
                    name: "Ana de Armas Caso".into(),
                },
                SearchHit {
                    id: 2,
                    name: "ana de armas".into(),
                },
            ],
        };
        let name = "Ana de Armas";
        let exact = page
            .results
            .iter()
            .find(|r| r.name.eq_ignore_ascii_case(name));
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
        assert_eq!(
            text(raw.profile_path).map(|p| format!("{IMG}/w342{p}")),
            Some(format!("{IMG}/w342/ap.jpg"))
        );
    }
}
