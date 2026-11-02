use std::collections::{BTreeSet, HashSet};

use anyhow::{Result, bail};

use kroma_module_host::HostStorage;
use kroma_primitives::now_ms;

use crate::db;
use crate::model::{EpisodeMonitoringBody, MonitoredTitle, RequestKind};

use super::title::{episode_row, note_known, roster};
use super::{reconcile, rows_of_open_requests};

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
    let held_open = rows_of_open_requests(&conn, &rows)?;
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
        .filter(|r| !held_open.contains(&r.id))
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
