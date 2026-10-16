//! A title as TMDB describes it, joined with its wanted ledger and the library.
//! Wider than the ledger on purpose: an admin has to see the seasons and
//! episodes nobody asked for to decide whether to go and get them, and has to
//! see what the library already holds of each one to decide whether it is
//! worth replacing. The ledger is a request's own rows, or every row of a
//! monitored title.
//!
//! Synchronous and does network/DB work: call it from a blocking context.

use std::collections::HashMap;

use anyhow::{Result, anyhow};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::{self, discover};
use crate::model::{
    LedgerEpisode, LedgerSeason, MediaRequest, RequestCoverage, RequestKind, RequestLedgerView,
    SeasonLedgerView, VideoStream,
};
use crate::services::requests::today_ymd;

#[cfg(test)]
mod tests;

type OnDisk = HashMap<(u32, u32), db::EpisodeOnDisk>;

struct Subject {
    kind: RequestKind,
    tmdb_id: u64,
    title: Option<String>,
    year: Option<u32>,
    coverage: RequestCoverage,
    rows: Vec<db::WantedRow>,
}

/// The request's seasons, tallied against the ledger and the library. Costs one
/// TMDB detail call; the per-episode rows are fetched a season at a time by
/// [`season_ledger`].
pub fn ledger<S: HostStorage>(state: &S, request_id: &str) -> Result<RequestLedgerView> {
    let subject = request_subject(state, request_id)?;
    build_ledger(state, subject)
}

/// One season's episodes, from TMDB, flagged with what the request covers and
/// what the library holds.
pub fn season_ledger<S: HostStorage>(
    state: &S,
    request_id: &str,
    season: u32,
) -> Result<SeasonLedgerView> {
    let subject = request_subject(state, request_id)?;
    build_season(state, &subject, season)
}

/// [`ledger`] for a title by its TMDB identity: every row it has, monitored or
/// asked for, against the library.
pub fn title_ledger<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<RequestLedgerView> {
    let subject = title_subject(state, kind, tmdb_id)?;
    build_ledger(state, subject)
}

/// [`season_ledger`] for a show by its TMDB id.
pub fn title_season_ledger<S: HostStorage>(
    state: &S,
    tmdb_id: u64,
    season: u32,
) -> Result<SeasonLedgerView> {
    let subject = title_subject(state, RequestKind::Show, tmdb_id)?;
    build_season(state, &subject, season)
}

fn request_subject<S: HostStorage>(state: &S, request_id: &str) -> Result<Subject> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, request_id)?.ok_or_else(|| anyhow!("request not found"))?;
    let rows = db::wanted_for_request(&conn, &req.id)?;
    Ok(Subject {
        kind: req.kind,
        tmdb_id: req.tmdb_id,
        title: Some(req.title),
        year: req.year,
        coverage: RequestCoverage {
            seasons: req.seasons,
            episodes: req.episodes,
        },
        rows,
    })
}

fn title_subject<S: HostStorage>(state: &S, kind: RequestKind, tmdb_id: u64) -> Result<Subject> {
    let conn = state.db().get()?;
    let monitored = db::get_monitored(&conn, kind, tmdb_id)?;
    let rows = db::wanted_for_title(&conn, kind, tmdb_id)?;
    Ok(Subject {
        kind,
        tmdb_id,
        title: monitored.as_ref().map(|m| m.title.clone()),
        year: monitored.as_ref().and_then(|m| m.year),
        coverage: RequestCoverage {
            seasons: monitored.map(|m| m.seasons),
            episodes: None,
        },
        rows,
    })
}

fn build_ledger<S: HostStorage>(state: &S, subject: Subject) -> Result<RequestLedgerView> {
    let detail = fetch_detail(state, subject.kind, subject.tmdb_id)?;
    let conn = state.db().get()?;
    let present = on_disk(&conn, subject.kind, subject.tmdb_id)?;
    let local_id = match subject.kind {
        RequestKind::Movie => db::movie_item_by_tmdb(&conn, subject.tmdb_id)?,
        RequestKind::Show => db::show_by_tmdb(&conn, subject.tmdb_id)?,
    };
    drop(conn);

    let seasons = detail
        .seasons
        .iter()
        .map(|s| LedgerSeason {
            season: s.season,
            name: s.name.clone(),
            air_date: s.air_date.clone(),
            episode_count: s.episode_count,
            requested: subject
                .rows
                .iter()
                .filter(|w| w.season == Some(s.season))
                .count() as u32,
            on_disk: present
                .keys()
                .filter(|(season, _)| *season == s.season)
                .count() as u32,
        })
        .collect();

    Ok(RequestLedgerView {
        kind: subject.kind,
        tmdb_id: subject.tmdb_id,
        title: subject.title.unwrap_or_else(|| detail.title.clone()),
        year: subject.year.or(detail.year),
        today: today_ymd(),
        coverage: subject.coverage,
        poster_url: detail.poster_url.clone(),
        backdrop_url: detail.backdrop_url.clone(),
        overview: detail.overview.clone(),
        seasons,
        on_disk: subject.kind == RequestKind::Movie && local_id.is_some(),
        local_id,
        air_date: detail.available_date.clone(),
    })
}

fn build_season<S: HostStorage>(
    state: &S,
    subject: &Subject,
    season: u32,
) -> Result<SeasonLedgerView> {
    if subject.kind != RequestKind::Show {
        return Ok(SeasonLedgerView {
            season,
            episodes: Vec::new(),
        });
    }
    let conn = state.db().get()?;
    let present = on_disk(&conn, subject.kind, subject.tmdb_id)?;
    drop(conn);

    let episodes = season_episodes(state, subject.tmdb_id, season)?
        .into_iter()
        .map(|ep| {
            let row = subject
                .rows
                .iter()
                .find(|w| w.season == Some(season) && w.episode == Some(ep.episode));
            let file = present.get(&(season, ep.episode));
            LedgerEpisode {
                season,
                episode: ep.episode,
                name: ep.name,
                overview: ep.overview,
                air_date: ep.air_date,
                still_url: ep.still_url,
                rating: ep.rating,
                on_disk: file.is_some(),
                wanted_id: row.map(|w| w.id.clone()),
                wanted_status: row.map(|w| w.status.clone()),
                item_id: file.map(|f| f.item_id.clone()),
                video: file.and_then(video_of),
                duration_ms: file.and_then(|f| f.duration_ms),
            }
        })
        .collect();
    Ok(SeasonLedgerView { season, episodes })
}

/// The wanted rows a season WOULD get, for a season the request does not cover.
/// Persists nothing: it exists so an interactive search can be aimed at a season
/// outside the request, which is most of what an admin looks for.
pub fn preview_season_rows<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    season: u32,
) -> Result<Vec<db::WantedRow>> {
    if req.kind != RequestKind::Show {
        return Ok(Vec::new());
    }
    let detail = fetch_detail(state, req.kind, req.tmdb_id)?;
    Ok(season_episodes(state, req.tmdb_id, season)?
        .into_iter()
        .map(|ep| db::WantedRow {
            id: format!("preview|{}|s{season:02}e{:03}", req.id, ep.episode),
            request_id: Some(req.id.clone()),
            kind: "episode".into(),
            tmdb_id: req.tmdb_id,
            imdb_id: detail.imdb_id.clone(),
            title: req.title.clone(),
            year: req.year,
            season: Some(season),
            episode: Some(ep.episode),
            air_date: ep.air_date,
            status: "wanted".into(),
            last_search_at: None,
        })
        .collect())
}

fn video_of(file: &db::EpisodeOnDisk) -> Option<VideoStream> {
    file.codec.as_ref().map(|codec| VideoStream {
        codec: codec.clone(),
        width: file.width,
        height: file.height,
        hdr: file.hdr,
        bit_depth: file.bit_depth,
        hdr_format: None,
        dolby_vision_profile: None,
        color: None,
    })
}

fn fetch_detail<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<discover::DiscoverRawDetail> {
    let key = tmdb_key(state)?;
    discover::detail(&key, &state.metadata_language(), kind, tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))
}

fn season_episodes<S: HostStorage>(
    state: &S,
    tmdb_id: u64,
    season: u32,
) -> Result<Vec<metadata::EpisodeArt>> {
    let key = tmdb_key(state)?;
    Ok(metadata::season_episodes(&key, &state.metadata_language(), tmdb_id, season).episodes)
}

fn tmdb_key<S: HostStorage>(state: &S) -> Result<String> {
    state
        .secret("tmdb")
        .ok_or_else(|| anyhow!("TMDB is not configured"))
}

fn on_disk(conn: &db::PooledConn, kind: RequestKind, tmdb_id: u64) -> Result<OnDisk> {
    if kind != RequestKind::Show {
        return Ok(OnDisk::new());
    }
    let Some(show_id) = db::show_by_tmdb(conn, tmdb_id)? else {
        return Ok(OnDisk::new());
    };
    Ok(db::episodes_on_disk(conn, &show_id)?
        .into_iter()
        .map(|row| ((row.season, row.episode), row))
        .collect())
}
