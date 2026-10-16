//! Monitoring: the titles the server wants to hold, Sonarr and Radarr's model.
//! A monitored movie is one wanted row; a monitored show is one row per
//! monitored episode, plus the seasons whose new episodes join as TMDB lists
//! them. Synchronous and does network/DB work: call it from a blocking context.

mod preset;
mod reconcile;
mod refresh;
mod title;

#[cfg(test)]
mod tests;

use std::collections::{BTreeSet, HashSet};

use anyhow::{bail, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::discover::DiscoverRawDetail;
use crate::model::{
    BulkMonitorBody, EpisodeMonitoringBody, MediaRequest, MonitorBody, MonitorPreset,
    MonitoredTitle, RequestKind, RequestStatus, TitleRef,
};
use crate::services::jobs::now_ms;
use crate::services::requests::today_ymd;

pub use reconcile::{reconcile_pass, ReconcileSummary};
pub use refresh::refresh_pass;

use preset::RosterEpisode;
use title::{apply_detail, episode_row, fetch_detail, movie_row, new_title, note_known, roster};

/// Monitors a title, or changes how it is monitored. A show monitored for the
/// first time with no preset takes `All`.
pub fn monitor<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    body: &MonitorBody,
    added_by: Option<&str>,
) -> Result<MonitoredTitle> {
    let detail = fetch_detail(state, kind, tmdb_id)?;
    let conn = state.db().get()?;
    let existing = db::get_monitored(&conn, kind, tmdb_id)?;
    drop(conn);
    let now = now_ms();
    let first_time = existing.is_none();
    let mut title = existing.unwrap_or_else(|| new_title(&detail, added_by, now));
    apply_detail(&mut title, &detail, now);
    if let Some(min) = body.min_availability {
        title.min_availability = min;
    }
    match kind {
        RequestKind::Movie => monitor_movie(state, &title, &detail)?,
        RequestKind::Show => {
            let preset = body.preset.or(first_time.then_some(MonitorPreset::All));
            if let Some(preset) = preset {
                apply_preset(state, &mut title, &detail, preset)?;
            }
        }
    }
    if let Some(monitor_new) = body.monitor_new_seasons {
        title.monitor_new_seasons = monitor_new;
    }
    db::upsert_monitored(state.db(), &title)?;
    reconcile::reconcile_title(state, kind, tmdb_id)?;
    if body.search_now {
        search_missing(state, kind, tmdb_id)?;
    }
    Ok(title)
}

/// What [`monitor_many`] did: how many titles it set, and why each other one
/// could not be.
#[derive(Debug, Default)]
pub struct BulkSummary {
    pub monitored: usize,
    pub failed: Vec<(TitleRef, String)>,
}

/// [`monitor`] over many titles; one that fails does not stop the rest.
pub fn monitor_many<S: HostStorage>(
    state: &S,
    body: &BulkMonitorBody,
    added_by: Option<&str>,
) -> BulkSummary {
    let mut summary = BulkSummary::default();
    for title in &body.titles {
        match monitor(state, title.kind, title.tmdb_id, &body.settings, added_by) {
            Ok(_) => summary.monitored += 1,
            Err(e) => summary.failed.push((*title, format!("{e:#}"))),
        }
    }
    summary
}

/// Stops monitoring a title. Its rows go with it; requests are left as they are.
pub fn unmonitor<S: HostStorage>(state: &S, kind: RequestKind, tmdb_id: u64) -> Result<bool> {
    db::delete_monitored(state.db(), kind, tmdb_id)
}

/// Switches whole seasons and single episodes of a monitored show on or off.
pub fn set_episodes<S: HostStorage>(
    state: &S,
    tmdb_id: u64,
    body: &EpisodeMonitoringBody,
) -> Result<MonitoredTitle> {
    let conn = state.db().get()?;
    let Some(mut title) = db::get_monitored(&conn, RequestKind::Show, tmdb_id)? else {
        bail!("the show is not monitored");
    };
    let rows = db::wanted_for_title(&conn, RequestKind::Show, tmdb_id)?;
    drop(conn);

    let mut seasons: BTreeSet<u32> = title.seasons.iter().copied().collect();
    let mut on: HashSet<(u32, u32)> = HashSet::new();
    let mut off: HashSet<(u32, u32)> = HashSet::new();
    let mut whole_on: Vec<u32> = Vec::new();
    let mut whole_off: Vec<u32> = Vec::new();
    for switch in &body.seasons {
        if switch.monitored {
            seasons.insert(switch.season);
            whole_on.push(switch.season);
        } else {
            seasons.remove(&switch.season);
            whole_off.push(switch.season);
        }
    }
    for switch in &body.episodes {
        let unit = (switch.episode.season, switch.episode.episode);
        if switch.monitored {
            on.insert(unit);
        } else {
            off.insert(unit);
        }
    }

    let to_read: BTreeSet<u32> = whole_on
        .iter()
        .copied()
        .chain(on.iter().chain(off.iter()).map(|(s, _)| *s))
        .collect();
    let listed = roster(state, tmdb_id, &to_read.into_iter().collect::<Vec<_>>())?;
    let imdb = rows.iter().find_map(|r| r.imdb_id.clone());
    let added: Vec<db::WantedRow> = listed
        .iter()
        .filter(|e| whole_on.contains(&e.season) || on.contains(&(e.season, e.episode)))
        .map(|e| episode_row(&title, imdb.as_deref(), e))
        .collect();
    let doomed: Vec<String> = rows
        .iter()
        .filter(|r| match (r.season, r.episode) {
            (Some(s), Some(e)) => whole_off.contains(&s) || off.contains(&(s, e)),
            _ => false,
        })
        .map(|r| r.id.clone())
        .collect();
    db::delete_wanted(state.db(), &doomed)?;
    db::insert_wanted(state.db(), &added, now_ms())?;

    title.seasons = seasons.into_iter().collect();
    title.updated_at = now_ms();
    note_known(&mut title, &listed);
    db::upsert_monitored(state.db(), &title)?;
    reconcile::reconcile_title(state, RequestKind::Show, tmdb_id)?;
    Ok(title)
}

/// The rows a title WOULD have, persisting nothing: a film's one row, or the
/// episodes of `season` (every season when `None`). What a search for a title
/// nobody monitors is aimed at.
pub fn preview_rows<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    season: Option<u32>,
) -> Result<Vec<db::WantedRow>> {
    let detail = fetch_detail(state, kind, tmdb_id)?;
    let title = new_title(&detail, None, now_ms());
    if kind == RequestKind::Movie {
        return Ok(vec![movie_row(&title, &detail)]);
    }
    let seasons: Vec<u32> = match season {
        Some(season) => vec![season],
        None => detail.seasons.iter().map(|s| s.season).collect(),
    };
    Ok(roster(state, tmdb_id, &seasons)?
        .iter()
        .map(|e| episode_row(&title, detail.imdb_id.as_deref(), e))
        .collect())
}

/// Monitors what an approved request asked for: its seasons join the title's,
/// and a request for the whole show also takes the seasons still to come.
pub(crate) fn monitor_for_request<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    detail: &DiscoverRawDetail,
) -> Result<()> {
    let conn = state.db().get()?;
    let existing = db::get_monitored(&conn, req.kind, req.tmdb_id)?;
    drop(conn);
    let now = now_ms();
    let mut title = existing.unwrap_or_else(|| new_title(detail, req.requested_by.as_deref(), now));
    apply_detail(&mut title, detail, now);
    if req.kind == RequestKind::Show {
        let whole = req.seasons.is_none() && req.episodes.is_none();
        let asked: Vec<u32> = if whole {
            detail.seasons.iter().map(|s| s.season).collect()
        } else {
            req.seasons.clone().unwrap_or_default()
        };
        let mut seasons: BTreeSet<u32> = title.seasons.iter().copied().collect();
        seasons.extend(asked);
        title.seasons = seasons.into_iter().collect();
        title.monitor_new_seasons |= whole;
    }
    db::upsert_monitored(state.db(), &title)
}

fn monitor_movie<S: HostStorage>(
    state: &S,
    title: &MonitoredTitle,
    detail: &DiscoverRawDetail,
) -> Result<()> {
    let row = movie_row(title, detail);
    db::insert_wanted(state.db(), std::slice::from_ref(&row), now_ms())?;
    db::set_movie_air_date(state.db(), title.tmdb_id, row.air_date.as_deref(), now_ms())
}

fn apply_preset<S: HostStorage>(
    state: &S,
    title: &mut MonitoredTitle,
    detail: &DiscoverRawDetail,
    preset: MonitorPreset,
) -> Result<()> {
    let conn = state.db().get()?;
    let on_disk: HashSet<(u32, u32)> = match db::show_by_tmdb(&conn, title.tmdb_id)? {
        Some(show_id) => db::episodes_present(&conn, &show_id)?.into_iter().collect(),
        None => HashSet::new(),
    };
    let rows = db::wanted_for_title(&conn, RequestKind::Show, title.tmdb_id)?;
    let held_open = rows_of_open_requests(&conn, &rows)?;
    drop(conn);

    let seasons: Vec<u32> = detail.seasons.iter().map(|s| s.season).collect();
    let listed: Vec<RosterEpisode> = roster(
        state,
        title.tmdb_id,
        &preset::seasons_to_read(preset, &seasons, &on_disk),
    )?;
    let selection = preset::select(preset, &listed, &on_disk, &today_ymd());
    let chosen: HashSet<(u32, u32)> = selection.episodes.iter().copied().collect();
    let added: Vec<db::WantedRow> = listed
        .iter()
        .filter(|e| chosen.contains(&(e.season, e.episode)))
        .map(|e| episode_row(title, detail.imdb_id.as_deref(), e))
        .collect();
    let doomed: Vec<String> = rows
        .iter()
        .filter(|r| {
            let unit = (r.season.unwrap_or(0), r.episode.unwrap_or(0));
            !chosen.contains(&unit) && !held_open.contains(&r.id)
        })
        .map(|r| r.id.clone())
        .collect();
    db::delete_wanted(state.db(), &doomed)?;
    db::insert_wanted(state.db(), &added, now_ms())?;
    title.seasons = selection.seasons;
    title.monitor_new_seasons = selection.monitor_new_seasons;
    note_known(title, &listed);
    Ok(())
}

// A row an open request answers to is the requester's, so a preset the admin
// applies to the title never takes it away from them.
fn rows_of_open_requests(
    conn: &db::PooledConn,
    rows: &[db::WantedRow],
) -> Result<HashSet<String>> {
    let mut open: std::collections::HashMap<&str, bool> = std::collections::HashMap::new();
    let mut held = HashSet::new();
    for row in rows {
        let Some(request_id) = row.request_id.as_deref() else {
            continue;
        };
        let is_open = match open.get(request_id) {
            Some(known) => *known,
            None => {
                let live = db::get_request(conn, request_id)?.is_some_and(|r| {
                    !matches!(
                        r.status,
                        RequestStatus::Available | RequestStatus::Denied | RequestStatus::Failed
                    )
                });
                open.insert(request_id, live);
                live
            }
        };
        if is_open {
            held.insert(row.id.clone());
        }
    }
    Ok(held)
}

fn search_missing<S: HostStorage>(state: &S, kind: RequestKind, tmdb_id: u64) -> Result<()> {
    let conn = state.db().get()?;
    let wanted: Vec<String> = db::wanted_for_title(&conn, kind, tmdb_id)?
        .into_iter()
        .filter(|w| w.status == "wanted")
        .map(|w| w.id)
        .collect();
    drop(conn);
    db::reset_wanted_search(state.db(), &wanted, now_ms())?;
    state.trigger_job("acquisition.search", "monitored");
    Ok(())
}
