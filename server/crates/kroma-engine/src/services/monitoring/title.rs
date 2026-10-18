use anyhow::{Result, anyhow};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::{self, discover::DiscoverRawDetail};
use crate::model::{MinAvailability, MonitoredTitle, RequestKind};
use crate::services::requests::shift_ymd;

use super::preset::RosterEpisode;

pub(crate) fn tmdb_key<S: HostStorage>(state: &S) -> Result<String> {
    state
        .secret("tmdb")
        .ok_or_else(|| anyhow!("TMDB is not configured"))
}

pub(crate) fn fetch_detail<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<DiscoverRawDetail> {
    let key = tmdb_key(state)?;
    metadata::discover::detail(&key, &state.metadata_language(), kind, tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))
}

/// The episodes TMDB lists for `seasons`, one call per season.
pub(crate) fn roster<S: HostStorage>(
    state: &S,
    tmdb_id: u64,
    seasons: &[u32],
) -> Result<Vec<RosterEpisode>> {
    let key = tmdb_key(state)?;
    let lang = state.metadata_language();
    Ok(seasons
        .iter()
        .flat_map(|&season| {
            metadata::season_episodes(&key, &lang, tmdb_id, season)
                .episodes
                .into_iter()
                .map(move |e| RosterEpisode {
                    season,
                    episode: e.episode,
                    air_date: e.air_date,
                })
        })
        .collect())
}

/// The original language as a tag, carrying the country of origin as its
/// region (`fr` from `CA` is `fr-CA`), so a VO rule can tell a Québec film.
pub(crate) fn original_language(detail: &DiscoverRawDetail) -> Option<String> {
    let code = detail.original_language.as_deref()?.to_ascii_lowercase();
    Some(match detail.origin_country.as_deref() {
        Some(country) if country.len() == 2 => format!("{code}-{}", country.to_ascii_uppercase()),
        _ => code,
    })
}

pub(crate) fn new_title(
    detail: &DiscoverRawDetail,
    added_by: Option<&str>,
    now: i64,
) -> MonitoredTitle {
    MonitoredTitle {
        kind: detail.kind,
        tmdb_id: detail.tmdb_id,
        title: detail.title.clone(),
        year: detail.year,
        poster_url: detail.poster_url.clone(),
        seasons: Vec::new(),
        monitor_new_seasons: false,
        min_availability: MinAvailability::default(),
        last_season: None,
        added_by: added_by.map(str::to_string),
        added_at: now,
        updated_at: now,
        original_language: original_language(detail),
        air_status: detail.status.clone(),
        refreshed_at: Some(now),
        known_episodes: Default::default(),
        aliases: detail.original_title.clone().into_iter().collect(),
    }
}

/// Records the last episode of each season in `listed` as known.
pub(crate) fn note_known(title: &mut MonitoredTitle, listed: &[RosterEpisode]) {
    for episode in listed {
        let known = title.known_episodes.entry(episode.season).or_insert(0);
        *known = (*known).max(episode.episode);
    }
}

/// Brings what TMDB says about a title into the stored row.
pub(crate) fn apply_detail(title: &mut MonitoredTitle, detail: &DiscoverRawDetail, now: i64) {
    title.title = detail.title.clone();
    title.year = detail.year;
    title.poster_url = detail.poster_url.clone().or(title.poster_url.take());
    title.original_language = original_language(detail).or(title.original_language.take());
    title.air_status = detail.status.clone();
    title.last_season = detail.seasons.iter().map(|s| s.season).max();
    if let Some(original) = &detail.original_title {
        if !title.aliases.contains(original) {
            title.aliases.push(original.clone());
        }
    }
    title.refreshed_at = Some(now);
    title.updated_at = now;
}

const CINEMA_TO_HOME_DAYS: i64 = 90;

/// When a film is searched from, by how early its title asks for it.
pub(crate) fn movie_air_date(min: MinAvailability, detail: &DiscoverRawDetail) -> Option<String> {
    match min {
        MinAvailability::Announced => None,
        MinAvailability::InCinemas => detail
            .cinema_date
            .clone()
            .or_else(|| detail.available_date.clone()),
        MinAvailability::Released => detail
            .home_date
            .clone()
            .or_else(|| shift_ymd(detail.cinema_date.as_deref()?, CINEMA_TO_HOME_DAYS)),
    }
}

pub(crate) fn movie_row(title: &MonitoredTitle, detail: &DiscoverRawDetail) -> db::WantedRow {
    db::WantedRow {
        id: db::unit_id("movie", title.tmdb_id, None, None),
        request_id: None,
        kind: "movie".into(),
        tmdb_id: title.tmdb_id,
        imdb_id: detail.imdb_id.clone(),
        title: title.title.clone(),
        year: title.year,
        season: None,
        episode: None,
        air_date: movie_air_date(title.min_availability, detail),
        status: "wanted".into(),
        last_search_at: None,
    }
}

pub(crate) fn episode_row(
    title: &MonitoredTitle,
    imdb_id: Option<&str>,
    episode: &RosterEpisode,
) -> db::WantedRow {
    db::WantedRow {
        id: db::unit_id(
            "episode",
            title.tmdb_id,
            Some(episode.season),
            Some(episode.episode),
        ),
        request_id: None,
        kind: "episode".into(),
        tmdb_id: title.tmdb_id,
        imdb_id: imdb_id.map(str::to_string),
        title: title.title.clone(),
        year: title.year,
        season: Some(episode.season),
        episode: Some(episode.episode),
        air_date: episode.air_date.clone(),
        status: "wanted".into(),
        last_search_at: None,
    }
}
