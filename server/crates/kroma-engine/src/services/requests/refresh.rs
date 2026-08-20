use anyhow::{anyhow, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{MediaRequest, RequestKind, RequestStatus};
use crate::services::jobs::now_ms;

use super::wanted::build_wanted_rows_from;
use super::{language, tmdb_key, today_ymd};

#[cfg(test)]
mod tests;

const REFRESH_MIN_INTERVAL_MS: i64 = 3 * 60 * 60 * 1000;

fn is_ended(air_status: Option<&str>) -> bool {
    matches!(air_status, Some("Ended") | Some("Canceled"))
}

fn needs_refresh(req: &MediaRequest, now: i64) -> bool {
    if matches!(req.status, RequestStatus::Denied | RequestStatus::Failed) {
        return false;
    }
    if let Some(ts) = req.last_refresh_at {
        if now - ts < REFRESH_MIN_INTERVAL_MS {
            return false;
        }
    }
    match req.kind {
        RequestKind::Movie => req.status != RequestStatus::Available,
        RequestKind::Show => !is_ended(req.air_status.as_deref()),
    }
}

/// Re-fetch every refreshable request from TMDB: additively extend its wanted
/// ledger, backfill air dates, and store the airing signals. An episode that
/// aired since the last pass is put back at the front of the search queue and
/// the search job is kicked, so a weekly show is looked for the day it airs
/// rather than whenever the cron next comes round.
pub fn refresh_pass<S: HostStorage>(state: &S) -> Result<usize> {
    let conn = state.db().get()?;
    let all = db::list_requests(&conn, None)?;
    drop(conn);
    let now = now_ms();
    let mut refreshed = 0usize;
    let mut newly_aired: Vec<String> = Vec::new();
    for req in all {
        if !needs_refresh(&req, now) {
            continue;
        }
        // A per-request failure must not abort the pass; the next cron retries.
        match refresh_one(state, &req) {
            Ok(aired) => newly_aired.extend(aired),
            Err(e) => {
                tracing::warn!(target: "requests", request = %req.id, "refresh failed: {e:#}");
                continue;
            }
        }
        refreshed += 1;
    }
    if !newly_aired.is_empty() {
        db::reset_wanted_search(state.db(), &newly_aired, now)?;
        tracing::info!(target: "requests", count = newly_aired.len(), "newly aired, searching now");
        state.trigger_job("acquisition.search", "episode-aired");
    }
    Ok(refreshed)
}

// The ids of rows this refresh found to be airable now: newly inserted rows
// already past their air date, plus rows whose date was backfilled into the
// past. Both are cases where waiting for the next cron tick loses a day.
fn refresh_one<S: HostStorage>(state: &S, req: &MediaRequest) -> Result<Vec<String>> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;

    let today = today_ymd();
    let mut newly_aired: Vec<String> = Vec::new();
    if req.kind == RequestKind::Show {
        newly_aired = refresh_wanted(state, req, &detail, &today)?;
    } else if let Some(avail) = detail.available_date.as_deref() {
        // set_wanted_air_date only writes rows whose air_date IS NULL, so a known
        // date is never overwritten.
        let conn = state.db().get()?;
        let rows = db::wanted_for_request(&conn, &req.id)?;
        drop(conn);
        for w in rows.iter().filter(|w| w.air_date.is_none()) {
            db::set_wanted_air_date(state.db(), &w.id, avail, now_ms())?;
            if avail <= today.as_str() && w.status == "wanted" {
                newly_aired.push(w.id.clone());
            }
        }
    }

    // A movie's next air date is only reported while still in the future: a past
    // date means "already out", which gets no upcoming badge.
    let next_air_date = match req.kind {
        RequestKind::Show => detail.next_air.as_ref().map(|(d, _, _)| d.clone()),
        RequestKind::Movie => detail.available_date.clone().filter(|d| d.as_str() > today.as_str()),
    };
    db::set_request_air(
        state.db(),
        &req.id,
        detail.status.as_deref(),
        next_air_date.as_deref(),
        now_ms(),
    )?;
    Ok(newly_aired)
}

// Additive only: inserts missing (season, episode) rows and backfills air dates.
// Never deletes a row and never changes a row's status. Answers with the rows
// that became searchable in the process.
fn refresh_wanted<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    detail: &discover::DiscoverRawDetail,
    today: &str,
) -> Result<Vec<String>> {
    let conn = state.db().get()?;
    let existing = db::wanted_for_request(&conn, &req.id)?;
    drop(conn);
    // Never seed a ledger, only extend one: a pending request must stay empty or
    // the search pass would grab before a moderator green-lit it.
    if existing.is_empty() {
        return Ok(Vec::new());
    }
    let desired = build_wanted_rows_from(state, req, detail)?;

    use std::collections::HashMap;
    // Key on (season, episode), not id: a row minted under an older id formula
    // must still dedup.
    let have: HashMap<(Option<u32>, Option<u32>), &db::WantedRow> =
        existing.iter().map(|w| ((w.season, w.episode), w)).collect();

    let mut to_insert: Vec<db::WantedRow> = Vec::new();
    let mut newly_aired: Vec<String> = Vec::new();
    for d in desired {
        match have.get(&(d.season, d.episode)) {
            None => {
                if d.air_date.as_deref().is_none_or(|air| air <= today) {
                    newly_aired.push(d.id.clone());
                }
                to_insert.push(d);
            }
            Some(row) => backfill_air_date(state, row, d.air_date.as_deref(), today, &mut newly_aired)?,
        }
    }
    db::insert_wanted(state.db(), &to_insert, now_ms())?;
    Ok(newly_aired)
}

// A row TMDB has since dated. Only ever fills a blank -- a date already known is
// the one the ledger was built with -- and reports the row when that date turns
// out to be in the past, since it just became searchable.
fn backfill_air_date<S: HostStorage>(
    state: &S,
    row: &db::WantedRow,
    air_date: Option<&str>,
    today: &str,
    newly_aired: &mut Vec<String>,
) -> Result<()> {
    if row.air_date.is_some() {
        return Ok(());
    }
    let Some(air) = air_date else { return Ok(()) };
    db::set_wanted_air_date(state.db(), &row.id, air, now_ms())?;
    if air <= today && row.status == "wanted" {
        newly_aired.push(row.id.clone());
    }
    Ok(())
}
