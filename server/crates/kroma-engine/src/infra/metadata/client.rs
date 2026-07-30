//! TMDB HTTP client: search for the best match, fetch its details + external
//! IDs / credits / images via `curl`, and map the JSON into a [`Metadata`].

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tracing::{debug, warn};

use crate::domain::metadata::{CastMember, Metadata};

use super::cache::Cache;
use super::common::{build_cast, build_crew, RawCreatedBy, RawCredits};
use super::search;

pub(super) const API: &str = "https://api.themoviedb.org/3";

/// A function, not a bare const, so tests can override it via `#[cfg(test)]`.
pub(super) fn api() -> String {
    #[cfg(test)]
    if let Some(base) = test_override::get() {
        return base;
    }
    API.to_string()
}

/// Test-only TMDB base override. Thread-local, so tests running in parallel
/// cannot see each other's fake server.
#[cfg(test)]
pub(crate) mod test_override {
    use std::cell::RefCell;

    thread_local! {
        static BASE: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    pub(crate) fn get() -> Option<String> {
        BASE.with(|b| b.borrow().clone())
    }

    pub(crate) fn set(base: &str) {
        BASE.with(|b| *b.borrow_mut() = Some(base.to_string()));
    }

    pub(crate) fn clear() {
        BASE.with(|b| *b.borrow_mut() = None);
    }
}
pub(super) const IMG: &str = "https://image.tmdb.org/t/p";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Movie,
    Tv,
}

impl Target {
    pub(super) fn search_path(self) -> &'static str {
        match self {
            Target::Movie => "search/movie",
            Target::Tv => "search/tv",
        }
    }
    fn detail_path(self) -> &'static str {
        match self {
            Target::Movie => "movie",
            Target::Tv => "tv",
        }
    }
    /// TMDB uses a different year query param for movies vs. shows.
    /// `primary_release_year` is the precise movie filter Seerr/Overseerr use.
    pub(super) fn year_param(self) -> &'static str {
        match self {
            Target::Movie => "primary_release_year",
            Target::Tv => "first_air_date_year",
        }
    }
    fn web_kind(self) -> &'static str {
        self.detail_path()
    }
}

const MAX_CAST: usize = 12;
const MAX_CREW: usize = 8;

// TMDB returns keywords unordered; this bounds how much feeds the embedding doc.
const MAX_KEYWORDS: usize = 20;

pub fn curl_available() -> bool {
    Command::new("curl")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn detail_key(target: Target, language: &str, title: &str, year: Option<u32>) -> String {
    format!(
        "{}|{}|{}|{}",
        target.detail_path(),
        language,
        year.unwrap_or(0),
        title.to_lowercase()
    )
}

// The `#` prefix can't collide with a title-keyed entry (titles are
// lowercased text, the year slot is numeric).
fn detail_key_id(target: Target, language: &str, id: u64) -> String {
    format!("{}|{}|#{id}", target.detail_path(), language)
}

/// Resolve metadata for `title`/`year` in one language, caching the result.
pub fn lookup(
    cache: &Cache,
    api_key: &str,
    language: &str,
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Option<Metadata> {
    let key = detail_key(target, language, title, year);
    if let Some(cached) = cache.get(&key) {
        return cached;
    }
    match fetch(api_key, language, target, title, year) {
        Ok(Some(meta)) => {
            cache.put(key, Some(meta.clone()));
            Some(meta)
        }
        // Genuine no-match: cache it so we don't retry every request.
        Ok(None) => {
            cache.put(key, None);
            None
        }
        // A request failure (bad key, rate-limit, timeout, network) is never
        // cached: caching `None` here would poison the title on a transient blip.
        Err(()) => None,
    }
}

/// The same title resolved in several languages, one [`Metadata`] per language
/// that fetched. Invariant fields (ids, art, people) are identical across
/// entries; only the localized text differs. Keyed by base language code
/// (e.g. `"en"`).
pub struct Resolved {
    pub by_lang: std::collections::HashMap<String, Metadata>,
}

/// Resolve `title`/`year` in every language in `langs`. The TMDB id is resolved
/// once (a search in `search_lang`), then details are fetched per language
/// against that id; a language whose fetch fails transiently is omitted.
/// `None` means the title did not resolve at all.
pub fn lookup_all(
    cache: &Cache,
    api_key: &str,
    search_lang: &str,
    langs: &[&str],
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Option<Resolved> {
    let id = match search::best_id(api_key, search_lang, target, title, year) {
        Ok(Some(id)) => id,
        // No match or a transient search failure: retried on the next pass.
        _ => return None,
    };
    let by_lang = details_by_lang(cache, api_key, langs, target, id, |lang| {
        detail_key(target, lang, title, year)
    });
    (!by_lang.is_empty()).then_some(Resolved { by_lang })
}

/// Same as [`lookup_all`] but for an already-known TMDB id: no search. Used for
/// a pinned id (import or operator correction), which must never be
/// re-guessed by title.
pub fn lookup_all_by_id(
    cache: &Cache,
    api_key: &str,
    langs: &[&str],
    target: Target,
    id: u64,
) -> Option<Resolved> {
    let by_lang =
        details_by_lang(cache, api_key, langs, target, id, |lang| detail_key_id(target, lang, id));
    (!by_lang.is_empty()).then_some(Resolved { by_lang })
}

fn details_by_lang(
    cache: &Cache,
    api_key: &str,
    langs: &[&str],
    target: Target,
    id: u64,
    key_for: impl Fn(&str) -> String,
) -> std::collections::HashMap<String, Metadata> {
    let mut by_lang = std::collections::HashMap::new();
    for &lang in langs {
        let key = key_for(lang);
        let meta = match cache.get(&key) {
            Some(Some(m)) => m,
            Some(None) => continue,
            None => match fetch_details(api_key, lang, target, id) {
                Ok(m) => {
                    cache.put(key, Some(m.clone()));
                    m
                }
                Err(()) => continue,
            },
        };
        by_lang.insert(lang.to_string(), meta);
    }
    by_lang
}

// `Ok(Some)` = resolved, `Ok(None)` = no match (cacheable), `Err(())` =
// transient request failure the caller must not cache.
fn fetch(
    api_key: &str,
    language: &str,
    target: Target,
    title: &str,
    year: Option<u32>,
) -> Result<Option<Metadata>, ()> {
    match search::best_id(api_key, language, target, title, year)? {
        Some(id) => Ok(Some(fetch_details(api_key, language, target, id)?)),
        None => Ok(None),
    }
}

fn fetch_details(
    api_key: &str,
    language: &str,
    target: Target,
    id: u64,
) -> Result<Metadata, ()> {
    // Base language code (e.g. "fr" from "fr-FR") for picking a localized logo.
    let lang2 = language.split('-').next().unwrap_or("en");
    let detail_params = vec![
        ("language", language.to_string()),
        ("append_to_response", "external_ids,credits,images,keywords".to_string()),
        ("include_image_language", format!("{lang2},en,null")),
    ];
    let d: Details =
        curl_json(&format!("{}/{}/{id}", api(), target.detail_path()), api_key, &detail_params)?;

    let ext = d.external_ids;
    let imdb_id = d
        .imdb_id
        .or_else(|| ext.as_ref().and_then(|e| e.imdb_id.clone()))
        .filter(|s| !s.is_empty());
    // TVDB series id (TV only) keys the theme-song lookup during enrichment.
    let tvdb_id = ext.as_ref().and_then(|e| e.tvdb_id).filter(|&id| id > 0);

    // Cast + crew share the appended `credits` block; TV creators come from
    // the top-level `created_by`.
    let (raw_cast, raw_crew) = d.credits.map(|c| (c.cast, c.crew)).unwrap_or_default();
    let cast = build_cast(raw_cast, MAX_CAST, false);
    let crew = build_crew(raw_crew, d.created_by, MAX_CREW);

    Ok(Metadata {
        provider: "tmdb",
        tmdb_id: d.id,
        imdb_id,
        title: d.title.or(d.name),
        tagline: d.tagline.filter(|s| !s.is_empty()),
        overview: d.overview.filter(|s| !s.is_empty()),
        release_date: d.release_date.or(d.first_air_date).filter(|s| !s.is_empty()),
        genres: d.genres.into_iter().map(|g| g.name).collect(),
        keywords: d.keywords.map(collect_keywords).unwrap_or_default(),
        rating: d.vote_average.filter(|v| *v > 0.0),
        poster_url: d.poster_path.map(|p| format!("{IMG}/w500{p}")),
        backdrop_url: d.backdrop_path.map(|p| format!("{IMG}/w1280{p}")),
        logo_url: d
            .images
            .as_ref()
            .and_then(|i| pick_logo(&i.logos, lang2))
            .map(|p| format!("{IMG}/w500{p}")),
        cast,
        crew,
        // Resolved later (a disk download) by `infra::theme`; this lookup only
        // carries the TVDB id it needs.
        theme_url: None,
        tvdb_id,
        tmdb_url: format!("https://www.themoviedb.org/{}/{id}", target.web_kind()),
    })
}

/// Per-episode artwork + text resolved from a TMDB season fetch.
#[derive(Debug, Clone)]
pub struct EpisodeArt {
    pub episode: u32,
    pub still_url: Option<String>,
    pub name: Option<String>,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub rating: Option<f32>,
}

#[derive(Debug, Clone, Default)]
pub struct SeasonData {
    pub episodes: Vec<EpisodeArt>,
    pub cast: Vec<CastMember>,
}

/// Fetches one season's episodes and cast in a single TMDB call. Returns empty
/// data on any failure: season enrichment is best-effort and must never break
/// show enrichment.
pub fn season_episodes(api_key: &str, language: &str, tv_id: u64, season: u32) -> SeasonData {
    let params = vec![
        ("language", language.to_string()),
        ("append_to_response", "credits".to_string()),
    ];
    let resp: SeasonResp =
        match curl_json(&format!("{}/tv/{tv_id}/season/{season}", api()), api_key, &params) {
            Ok(r) => r,
            Err(()) => return SeasonData::default(),
        };
    let episodes = resp
        .episodes
        .into_iter()
        .map(|e| EpisodeArt {
            episode: e.episode_number,
            still_url: e.still_path.map(|p| format!("{IMG}/w300{p}")),
            name: e.name.filter(|s| !s.is_empty()),
            overview: e.overview.filter(|s| !s.is_empty()),
            air_date: e.air_date.filter(|s| !s.is_empty()),
            rating: e.vote_average.filter(|v| *v > 0.0),
        })
        .collect();
    let cast = build_cast(resp.credits.map(|c| c.cast).unwrap_or_default(), MAX_CAST, false);
    SeasonData { episodes, cast }
}

/// Fetches one season in several languages, keyed by language code. Languages
/// that return nothing are omitted.
pub fn season_episodes_multi(
    api_key: &str,
    langs: &[&str],
    tv_id: u64,
    season: u32,
) -> std::collections::HashMap<String, SeasonData> {
    langs
        .iter()
        .filter_map(|&lang| {
            let data = season_episodes(api_key, lang, tv_id, season);
            (!data.episodes.is_empty() || !data.cast.is_empty()).then(|| (lang.to_string(), data))
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct SeasonResp {
    #[serde(default)]
    episodes: Vec<RawEpisode>,
    #[serde(default)]
    credits: Option<RawCredits>,
}

#[derive(Debug, Deserialize)]
struct RawEpisode {
    #[serde(default)]
    episode_number: u32,
    #[serde(default)]
    still_path: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    overview: Option<String>,
    #[serde(default)]
    air_date: Option<String>,
    #[serde(default)]
    vote_average: Option<f32>,
}

// First TMDB failure logs at WARN (so a bad `KROMA_TMDB_API_KEY` or dead
// network is visible); later ones drop to DEBUG to avoid spamming a bulk
// enrichment pass.
static FAILURE_WARNED: AtomicBool = AtomicBool::new(false);

fn note_curl_failure(reason: &str, detail: &str) {
    let detail = detail.trim();
    if FAILURE_WARNED.swap(true, Ordering::Relaxed) {
        debug!(reason, detail, "TMDB request failed");
    } else {
        warn!(
            reason,
            detail,
            "TMDB enrichment request failed check KROMA_TMDB_API_KEY and network connectivity; \
             further failures are logged at debug level"
        );
    }
}

/// GET `url` with URL-encoded query params via `curl`, parsed as JSON `T`.
/// `Err(())` on any transport/HTTP-status/parse failure so the caller never
/// caches a transient failure as a permanent miss. `-S` keeps curl's error
/// message on stderr even under `-s`; curl exit 22 = HTTP >= 400 (e.g. 401 bad
/// key), 28 = timeout, 6/7 = DNS/connect.
pub(super) fn curl_json<T: for<'de> Deserialize<'de>>(
    url: &str,
    api_key: &str,
    params: &[(&str, String)],
) -> Result<T, ()> {
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "-S", "-f", "-G", "--max-time", "10"]);
    // TMDB accepts a v3 key as the `api_key` query param, or a v4 read token
    // (a JWT: header.payload.signature) as a Bearer header. Pick by shape.
    if is_bearer_token(api_key) {
        cmd.arg("-H").arg(format!("Authorization: Bearer {api_key}"));
    } else {
        cmd.arg("--data-urlencode").arg(format!("api_key={api_key}"));
    }
    cmd.arg(url);
    for (k, v) in params {
        cmd.arg("--data-urlencode").arg(format!("{k}={v}"));
    }
    let out = match cmd.output() {
        Ok(out) => out,
        Err(e) => {
            note_curl_failure("spawn", &e.to_string());
            return Err(());
        }
    };
    if !out.status.success() {
        let code = out.status.code().unwrap_or(-1);
        note_curl_failure(
            &format!("curl_exit_{code}"),
            &String::from_utf8_lossy(&out.stderr),
        );
        return Err(());
    }
    serde_json::from_slice(&out.stdout).map_err(|e| {
        note_curl_failure("parse", &e.to_string());
    })
}

// A TMDB v4 read token is a JWT (`header.payload.signature`); v3 keys are
// 32-char hex with no dots.
fn is_bearer_token(key: &str) -> bool {
    key.split('.').count() == 3
}

#[derive(Debug, Deserialize)]
struct Details {
    id: u64,
    #[serde(default)]
    title: Option<String>, // movies
    #[serde(default)]
    name: Option<String>, // shows
    #[serde(default)]
    overview: Option<String>,
    #[serde(default)]
    tagline: Option<String>,
    #[serde(default)]
    release_date: Option<String>, // movies
    #[serde(default)]
    first_air_date: Option<String>, // shows
    #[serde(default)]
    vote_average: Option<f32>,
    #[serde(default)]
    poster_path: Option<String>,
    #[serde(default)]
    backdrop_path: Option<String>,
    #[serde(default)]
    genres: Vec<Genre>,
    #[serde(default)]
    imdb_id: Option<String>, // present on movie details
    #[serde(default)]
    external_ids: Option<ExternalIds>, // appended (carries imdb_id for shows)
    #[serde(default)]
    credits: Option<RawCredits>, // appended (cast + crew)
    #[serde(default)]
    created_by: Vec<RawCreatedBy>, // TV series creators (top-level on show details)
    #[serde(default)]
    images: Option<Images>, // appended (logos)
    #[serde(default)]
    keywords: Option<Keywords>, // appended (thematic tags)
}

// Movies nest under `keywords`, TV under `results`; only one is ever populated.
#[derive(Debug, Deserialize)]
struct Keywords {
    #[serde(default)]
    keywords: Vec<KeywordEntry>,
    #[serde(default)]
    results: Vec<KeywordEntry>,
}

#[derive(Debug, Deserialize)]
struct KeywordEntry {
    #[serde(default)]
    name: String,
}

fn collect_keywords(k: Keywords) -> Vec<String> {
    k.keywords
        .into_iter()
        .chain(k.results)
        .map(|e| e.name)
        .filter(|n| !n.is_empty())
        .take(MAX_KEYWORDS)
        .collect()
}

#[derive(Debug, Deserialize)]
struct Genre {
    name: String,
}

#[derive(Debug, Deserialize)]
struct Images {
    #[serde(default)]
    logos: Vec<ImageEntry>,
}

#[derive(Debug, Deserialize)]
struct ImageEntry {
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default, rename = "iso_639_1")]
    lang: Option<String>,
    #[serde(default)]
    vote_average: Option<f32>,
}

// Best title logo `file_path`: PNG only, preferring the configured language,
// then English, then language-neutral; ties broken by TMDB vote.
fn pick_logo(logos: &[ImageEntry], lang2: &str) -> Option<String> {
    let rank = |l: &ImageEntry| -> u8 {
        match l.lang.as_deref() {
            Some(x) if x == lang2 => 0,
            Some("en") => 1,
            None | Some("") => 2,
            _ => 3,
        }
    };
    logos
        .iter()
        .filter(|l| l.file_path.as_deref().is_some_and(|p| p.ends_with(".png")))
        .min_by(|a, b| {
            rank(a).cmp(&rank(b)).then(
                b.vote_average
                    .unwrap_or(0.0)
                    .partial_cmp(&a.vote_average.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
        })
        .and_then(|l| l.file_path.clone())
}

#[derive(Debug, Deserialize)]
struct ExternalIds {
    #[serde(default)]
    imdb_id: Option<String>,
    #[serde(default)]
    tvdb_id: Option<u64>, // present on TV external_ids; absent for movies
}

#[cfg(test)]
mod tests {
    use super::*;

    // Network is not exercised in tests; we validate the JSON→Metadata mapping
    // against representative TMDB payloads instead.
    #[test]
    fn parses_movie_details() {
        let raw = r#"{
            "id": 542178,
            "title": "The French Dispatch",
            "tagline": "Read all about it.",
            "overview": "A love letter to journalists.",
            "release_date": "2021-10-21",
            "vote_average": 7.4,
            "poster_path": "/poster.jpg",
            "backdrop_path": "/back.jpg",
            "genres": [{"id": 35, "name": "Comedy"}, {"id": 18, "name": "Drama"}],
            "imdb_id": "tt8847712",
            "external_ids": {"imdb_id": "tt8847712"}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        assert_eq!(d.id, 542178);
        assert_eq!(d.title.as_deref(), Some("The French Dispatch"));
        assert_eq!(d.imdb_id.as_deref(), Some("tt8847712"));
        assert_eq!(d.genres.len(), 2);
        assert_eq!(d.vote_average, Some(7.4));
    }

    #[test]
    fn parses_tv_details_with_external_ids() {
        let raw = r#"{
            "id": 1399,
            "name": "Game of Thrones",
            "overview": "Seven noble families fight.",
            "first_air_date": "2011-04-17",
            "vote_average": 8.4,
            "poster_path": "/got.jpg",
            "genres": [{"id": 10765, "name": "Sci-Fi & Fantasy"}],
            "external_ids": {"imdb_id": "tt0944947"}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        assert_eq!(d.name.as_deref(), Some("Game of Thrones"));
        assert!(d.title.is_none());
        assert_eq!(
            d.external_ids.and_then(|e| e.imdb_id).as_deref(),
            Some("tt0944947")
        );
    }

    #[test]
    fn parses_appended_credits() {
        let raw = r#"{
            "id": 1,
            "title": "X",
            "credits": {
                "cast": [
                    {"name": "Bravo", "character": "B", "order": 1},
                    {"name": "Alpha", "character": "A", "order": 0},
                    {"name": "NoChar", "character": "", "order": 2}
                ]
            }
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        let mut cast = d.credits.unwrap().cast;
        cast.sort_by_key(|m| m.order.unwrap_or(u32::MAX));
        assert_eq!(cast[0].name, "Alpha");
        assert_eq!(cast[0].character.as_deref(), Some("A"));
        // Empty character strings are dropped during the Metadata mapping.
        assert_eq!(cast[2].character.as_deref(), Some(""));
    }

    #[test]
    fn parses_season_episode_stills() {
        let raw = r#"{
            "episodes": [
                {"episode_number": 1, "still_path": "/s1.jpg", "name": "Pilot", "overview": "It begins.", "air_date": "2022-02-18", "vote_average": 8.1},
                {"episode_number": 2, "name": "Half Loop", "overview": ""}
            ]
        }"#;
        let s: SeasonResp = serde_json::from_str(raw).unwrap();
        assert_eq!(s.episodes.len(), 2);
        assert_eq!(s.episodes[0].episode_number, 1);
        assert_eq!(s.episodes[0].still_path.as_deref(), Some("/s1.jpg"));
        assert!(s.episodes[1].still_path.is_none());
    }

    #[test]
    fn collects_movie_and_tv_keywords() {
        // Movies nest under `keywords`.
        let movie: Keywords =
            serde_json::from_str(r#"{"keywords":[{"id":1,"name":"road movie"},{"id":2,"name":"summer"}]}"#)
                .unwrap();
        assert_eq!(collect_keywords(movie), vec!["road movie", "summer"]);
        // Shows nest under `results`.
        let tv: Keywords =
            serde_json::from_str(r#"{"results":[{"id":3,"name":"dystopia"}]}"#).unwrap();
        assert_eq!(collect_keywords(tv), vec!["dystopia"]);
    }
}
