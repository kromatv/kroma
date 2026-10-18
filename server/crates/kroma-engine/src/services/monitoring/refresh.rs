use std::collections::{BTreeSet, HashMap};

use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{MonitoredTitle, RequestKind};
use crate::services::jobs::now_ms;
use crate::services::requests::today_ymd;

use super::title::{apply_detail, episode_row, fetch_detail, movie_air_date, note_known, roster};

const REFRESH_MIN_INTERVAL_MS: i64 = 6 * 60 * 60 * 1000;

/// Re-reads every monitored title from TMDB: a show's monitored seasons take
/// the episodes announced since, a season announced above the last one joins
/// when the show takes new seasons, an undated episode gets its date, and a
/// film takes whatever its availability now works out to. Rows that became
/// searchable are put first in line and the search is woken.
pub fn refresh_pass<S: HostStorage>(state: &S) -> Result<usize> {
    let conn = state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let now = now_ms();
    let today = today_ymd();
    let mut refreshed = 0;
    let mut newly_aired: Vec<String> = Vec::new();
    for title in titles {
        if !needs_refresh(&title, now) {
            continue;
        }
        match refresh_one(state, title, &today) {
            Ok(aired) => newly_aired.extend(aired),
            Err(e) => {
                tracing::warn!(target: "monitoring", "refresh failed: {e:#}");
                continue;
            }
        }
        refreshed += 1;
    }
    if !newly_aired.is_empty() {
        db::reset_wanted_search(state.db(), &newly_aired, now)?;
        state.trigger_job("acquisition.search", "episode-aired");
    }
    Ok(refreshed)
}

fn needs_refresh(title: &MonitoredTitle, now: i64) -> bool {
    let recent = title
        .refreshed_at
        .is_some_and(|at| now - at < REFRESH_MIN_INTERVAL_MS);
    let ended = matches!(title.air_status.as_deref(), Some("Ended" | "Canceled"));
    !recent && !(title.kind == RequestKind::Show && ended && title.refreshed_at.is_some())
}

fn refresh_one<S: HostStorage>(
    state: &S,
    mut title: MonitoredTitle,
    today: &str,
) -> Result<Vec<String>> {
    let detail = fetch_detail(state, title.kind, title.tmdb_id)?;
    let previous_last = title.last_season;
    apply_detail(&mut title, &detail, now_ms());
    let conn = state.db().get()?;
    let rows = db::wanted_for_title(&conn, title.kind, title.tmdb_id)?;
    drop(conn);
    let mut aired = Vec::new();
    if title.kind == RequestKind::Movie {
        let date = movie_air_date(title.min_availability, &detail);
        if let Some(row) = rows.first().filter(|r| r.air_date != date) {
            db::set_movie_air_date(state.db(), title.tmdb_id, date.as_deref(), now_ms())?;
            if row.status == "wanted" && date.as_deref().is_none_or(|d| d <= today) {
                aired.push(row.id.clone());
            }
        }
    } else {
        if title.monitor_new_seasons {
            let mut seasons: BTreeSet<u32> = title.seasons.iter().copied().collect();
            seasons.extend(
                detail
                    .seasons
                    .iter()
                    .map(|s| s.season)
                    .filter(|&s| previous_last.is_some_and(|last| s > last)),
            );
            title.seasons = seasons.into_iter().collect();
        }
        aired = extend_seasons(state, &mut title, detail.imdb_id.as_deref(), &rows, today)?;
    }
    db::upsert_monitored(state.db(), &title)?;
    Ok(aired)
}

// Additive only: an episode announced since the last look joins, a row with no
// date gets one, and nothing is removed or re-statused. An episode that was
// already known and has no row was switched off, so it stays off.
fn extend_seasons<S: HostStorage>(
    state: &S,
    title: &mut MonitoredTitle,
    imdb_id: Option<&str>,
    rows: &[db::WantedRow],
    today: &str,
) -> Result<Vec<String>> {
    let have: HashMap<(Option<u32>, Option<u32>), &db::WantedRow> =
        rows.iter().map(|w| ((w.season, w.episode), w)).collect();
    let listed = roster(state, title.tmdb_id, &title.seasons)?;
    let mut added = Vec::new();
    let mut aired = Vec::new();
    for episode in &listed {
        let has_aired = episode.air_date.as_deref().is_some_and(|d| d <= today);
        let announced_since = title
            .known_episodes
            .get(&episode.season)
            .is_none_or(|&known| episode.episode > known);
        match have.get(&(Some(episode.season), Some(episode.episode))) {
            None if !announced_since => {}
            None => {
                let row = episode_row(title, imdb_id, episode);
                if has_aired {
                    aired.push(row.id.clone());
                }
                added.push(row);
            }
            Some(row) if row.air_date.is_none() => {
                if let Some(date) = episode.air_date.as_deref() {
                    db::set_wanted_air_date(state.db(), &row.id, date, now_ms())?;
                    if has_aired && row.status == "wanted" {
                        aired.push(row.id.clone());
                    }
                }
            }
            Some(_) => {}
        }
    }
    db::insert_wanted(state.db(), &added, now_ms())?;
    note_known(title, &listed);
    Ok(aired)
}
