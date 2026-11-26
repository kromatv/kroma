//! TMDB discovery: search/trending/detail for titles the library may NOT have
//! yet the request flow's window onto the outside catalog. Same JSON transport
//! as the core's library enrichment; returns plain adapter
//! structs the services layer flags against the local catalog + open requests
//! before they become wire types.

use crate::model::metadata::{CastMember, CrewMember};
use crate::model::{CountryRatings, RequestKind};

use super::{api, tmdb_json, IMG};
use super::certifications::Certifications;
use super::common::{build_cast, build_crew, studios_of};

mod english;
mod hits;
mod release;
#[cfg(test)]
mod tests;
mod wire;

pub use hits::{search, trending};
use english::{english, written};
use hits::hit_from;
use release::movie_dates;
use wire::{DetailResp, RawEpisodeStub, RawSeasonResp};

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
    pub studios: Vec<String>,
    pub ratings: CountryRatings,
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
    pub poster_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscoverScope {
    Movies,
    Shows,
    All,
}

/// Fetch one title's detail (+ external ids for the wanted ledger).
// The `()` Err is the unit error threaded up from `tmdb_json` via `?`; callers only
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
    // theatrical) and the age ratings, shows `content_ratings`; shows carry
    // `status` + `next_episode_to_air` natively. `translations` stands in for an
    // overview or tagline the asked language lacks.
    let append = match kind {
        RequestKind::Movie => "external_ids,credits,recommendations,release_dates,translations",
        RequestKind::Show => "external_ids,credits,recommendations,content_ratings,translations",
    };
    let params = vec![
        ("language", language.to_string()),
        ("append_to_response", append.to_string()),
    ];
    let url = format!("{}/{path}/{tmdb_id}", api());
    let mut d: DetailResp = tmdb_json(super::PURPOSE, &url, api_key, &params)?;
    let Some(title) = d.title.take().or(d.name.take()) else {
        return Ok(None);
    };
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
    let ratings = d
        .release_dates
        .as_ref()
        .or(d.content_ratings.as_ref())
        .map(Certifications::every_country)
        .unwrap_or_default();
    let dates = match kind {
        RequestKind::Movie => movie_dates(d.release_dates.take(), d.release_date.as_deref()),
        RequestKind::Show => Default::default(),
    };
    let original_title = d
        .original_title
        .take()
        .or(d.original_name.take())
        .filter(|o| !o.is_empty() && *o != title);
    let english = english(d.translations.take());
    Ok(Some(DiscoverRawDetail {
        kind,
        tmdb_id,
        title,
        year: year_of(d.release_date.as_deref().or(d.first_air_date.as_deref())),
        poster_url: d.poster_path.map(|p| format!("{IMG}/w500{p}")),
        backdrop_url: d.backdrop_path.map(|p| format!("{IMG}/w1280{p}")),
        overview: written(d.overview).or(english.overview),
        tagline: written(d.tagline).or(english.tagline),
        tmdb_genre_ids: d.genres.iter().map(|g| g.id).collect(),
        genres: d.genres.into_iter().map(|g| g.name).collect(),
        rating: d.vote_average.filter(|v| *v > 0.0),
        runtime_min: d.runtime.filter(|&r| r > 0),
        imdb_id: d
            .imdb_id
            .or(d.external_ids.and_then(|e| e.imdb_id))
            .filter(|s| !s.is_empty()),
        seasons: seasons_of(d.seasons),
        cast,
        crew,
        similar,
        studios: studios_of(d.production_companies, d.networks),
        ratings,
        status: d.status.take().filter(|s| !s.is_empty()),
        next_air: next_air_of(d.next_episode_to_air.take()),
        available_date: dates.available,
        home_date: dates.home,
        cinema_date: dates.cinema,
        original_language: d.original_language.filter(|l| !l.is_empty()),
        original_title,
        origin_country: d.origin_country.into_iter().next(),
    }))
}

fn seasons_of(seasons: Vec<RawSeasonResp>) -> Vec<RawSeason> {
    seasons
        .into_iter()
        .filter(|s| s.season_number.unwrap_or(0) >= 1)
        .map(|s| RawSeason {
            season: s.season_number.unwrap_or(1),
            name: s.name.filter(|n| !n.is_empty()),
            episode_count: s.episode_count.unwrap_or(0),
            air_date: s.air_date.filter(|a| !a.is_empty()),
            poster_url: s.poster_path.map(|p| format!("{IMG}/w342{p}")),
        })
        .collect()
}

fn next_air_of(next: Option<RawEpisodeStub>) -> Option<(String, u32, u32)> {
    let next = next?;
    let date = next.air_date.filter(|s| !s.is_empty())?;
    Some((
        date,
        next.season_number.unwrap_or(0),
        next.episode_number.unwrap_or(0),
    ))
}

// Truncates a TMDB date/datetime ("2024-02-27T00:00:00.000Z") to `YYYY-MM-DD`.
pub(super) fn ymd(s: &str) -> Option<String> {
    s.get(..10).map(str::to_string)
}

pub(super) fn year_of(date: Option<&str>) -> Option<u32> {
    date.and_then(|d| d.get(..4)).and_then(|y| y.parse().ok())
}
