//! TMDB discovery: search/trending/detail for titles the library may NOT have
//! yet the request flow's window onto the outside catalog. Same curl/JSON
//! transport as the sibling enrichment [`super::client`]; returns plain adapter
//! structs the services layer flags against the local catalog + open requests
//! before they become wire types.

use crate::domain::metadata::{CastMember, CrewMember};
use crate::model::RequestKind;

use super::client::{api, curl_json, IMG};
use super::common::{build_cast, build_crew};

mod hits;
mod release;
#[cfg(test)]
mod tests;
mod wire;

pub use hits::{search, trending};
use hits::hit_from;
use release::movie_dates;
use wire::DetailResp;

const MAX_CAST: usize = 12;
const MAX_CREW: usize = 6;
const MAX_SIMILAR: usize = 12;

/// One search/trending hit, unflagged.
#[derive(Debug, Clone)]
pub struct DiscoverHit {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    // Often the only title a scene release matches; empty when TMDB omits it.
    pub original_title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub overview: Option<String>,
    pub rating: Option<f32>,
}

#[derive(Debug, Clone, Default)]
pub struct DiscoverPage {
    pub hits: Vec<DiscoverHit>,
    pub page: u32,
    pub total_pages: u32,
}

/// A title's detail for the request flow (movie runtime / show seasons).
#[derive(Debug, Clone)]
pub struct DiscoverRawDetail {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub overview: Option<String>,
    pub tagline: Option<String>,
    pub genres: Vec<String>,
    pub tmdb_genre_ids: Vec<u32>,
    pub rating: Option<f32>,
    pub runtime_min: Option<u32>,
    pub imdb_id: Option<String>,
    // Regular seasons only (specials / season 0 excluded), ascending.
    pub seasons: Vec<RawSeason>,
    pub cast: Vec<CastMember>,
    // Directors / creators / writers, directors first.
    pub crew: Vec<CrewMember>,
    // TMDB recommendations for the "Titres similaires" rail (unflagged).
    pub similar: Vec<DiscoverHit>,
    // TMDB airing status ("Returning Series"/"Ended"/"Canceled" for shows;
    // "Released"/"Post Production"/… for movies). Feeds the refresh skip gate.
    pub status: Option<String>,
    // Show only: `(air_date YYYY-MM-DD, season, episode)`; `None` for movies /
    // shows with nothing upcoming.
    pub next_air: Option<(String, u32, u32)>,
    // Movie only: soonest date the film can be seen (home, else theatrical,
    // else the basic release_date), `YYYY-MM-DD`; `None` for shows.
    pub available_date: Option<String>,
    // Movie only: the digital or physical release, with no fallback: a film
    // still only in cinemas has none.
    pub home_date: Option<String>,
    // Movie only: the theatrical release, else the basic release_date.
    pub cinema_date: Option<String>,
    // ISO 639-1, and the first ISO 3166-1 country of origin.
    pub original_language: Option<String>,
    // The title in its own language, when TMDB gives it one apart from `title`.
    pub original_title: Option<String>,
    pub origin_country: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RawSeason {
    pub season: u32,
    pub name: Option<String>,
    pub episode_count: u32,
    pub air_date: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscoverScope {
    Movies,
    Shows,
    All,
}

/// Fetch one title's detail (+ external ids for the wanted ledger).
// The `()` Err is the unit error threaded up from `curl_json` via `?`; callers only
// care ok/err, so a richer error type would add nothing here.
#[allow(clippy::result_unit_err)]
pub fn detail(
    api_key: &str,
    language: &str,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<Option<DiscoverRawDetail>, ()> {
    let path = match kind {
        RequestKind::Movie => "movie",
        RequestKind::Show => "tv",
    };
    // `recommendations` is TMDB's editorially-tuned "more like this" (better than
    // the raw `similar` genre overlap); `credits` carries cast + crew. Movies add
    // `release_dates` for the typed home-availability windows (digital / physical /
    // theatrical); shows carry `status` + `next_episode_to_air` natively (no append).
    let append = match kind {
        RequestKind::Movie => "external_ids,credits,recommendations,release_dates",
        RequestKind::Show => "external_ids,credits,recommendations",
    };
    let params = vec![
        ("language", language.to_string()),
        ("append_to_response", append.to_string()),
    ];
    let mut d: DetailResp =
        match curl_json(&format!("{}/{path}/{tmdb_id}", api()), api_key, &params) {
            Ok(d) => d,
            // curl -f turns TMDB 404s into exit 22; treat any failure on the detail
            // endpoint as "not found" only when the id namespace mismatched is
            // indistinguishable, so callers surface a uniform not-found.
            Err(()) => return Err(()),
        };
    let title = match d.title.or(d.name) {
        Some(t) => t,
        None => return Ok(None),
    };
    let seasons = d
        .seasons
        .into_iter()
        .filter(|s| s.season_number.unwrap_or(0) >= 1)
        .map(|s| RawSeason {
            season: s.season_number.unwrap_or(1),
            name: s.name.filter(|n| !n.is_empty()),
            episode_count: s.episode_count.unwrap_or(0),
            air_date: s.air_date.filter(|a| !a.is_empty()),
        })
        .collect();
    let (raw_cast, raw_crew) = d.credits.map(|c| (c.cast, c.crew)).unwrap_or_default();
    let cast = build_cast(raw_cast, MAX_CAST, true);
    let crew = build_crew(raw_crew, d.created_by, MAX_CREW);
    // `recommendations` is a `movie` detail even when appended to a `tv` detail,
    // so the media_type is implied by the parent title's kind.
    let similar = d
        .recommendations
        .map(|r| r.results)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|h| hit_from(kind, h))
        .take(MAX_SIMILAR)
        .collect();
    // Airing signals for the request refresh pass + "coming soon" badges.
    let status = d.status.take().filter(|s| !s.is_empty());
    let next_air = d.next_episode_to_air.take().and_then(|e| {
        let date = e.air_date.filter(|s| !s.is_empty())?;
        Some((
            date,
            e.season_number.unwrap_or(0),
            e.episode_number.unwrap_or(0),
        ))
    });
    let dates = match kind {
        RequestKind::Movie => movie_dates(d.release_dates.take(), d.release_date.as_deref()),
        RequestKind::Show => Default::default(),
    };
    let original_title = d
        .original_title
        .take()
        .or(d.original_name.take())
        .filter(|o| !o.is_empty() && *o != title);
    Ok(Some(DiscoverRawDetail {
        kind,
        tmdb_id,
        title,
        year: year_of(d.release_date.as_deref().or(d.first_air_date.as_deref())),
        poster_url: d.poster_path.map(|p| format!("{IMG}/w500{p}")),
        backdrop_url: d.backdrop_path.map(|p| format!("{IMG}/w1280{p}")),
        overview: d.overview.filter(|s| !s.is_empty()),
        tagline: d.tagline.filter(|s| !s.is_empty()),
        tmdb_genre_ids: d.genres.iter().map(|g| g.id).collect(),
        genres: d.genres.into_iter().map(|g| g.name).collect(),
        rating: d.vote_average.filter(|v| *v > 0.0),
        runtime_min: d.runtime.filter(|&r| r > 0),
        imdb_id: d
            .imdb_id
            .or(d.external_ids.and_then(|e| e.imdb_id))
            .filter(|s| !s.is_empty()),
        seasons,
        cast,
        crew,
        similar,
        status,
        next_air,
        available_date: dates.available,
        home_date: dates.home,
        cinema_date: dates.cinema,
        original_language: d.original_language.filter(|l| !l.is_empty()),
        original_title,
        origin_country: d.origin_country.into_iter().next(),
    }))
}

// Truncates a TMDB date/datetime ("2024-02-27T00:00:00.000Z") to `YYYY-MM-DD`.
pub(super) fn ymd(s: &str) -> Option<String> {
    s.get(..10).map(str::to_string)
}

pub(super) fn year_of(date: Option<&str>) -> Option<u32> {
    date.and_then(|d| d.get(..4)).and_then(|y| y.parse().ok())
}
