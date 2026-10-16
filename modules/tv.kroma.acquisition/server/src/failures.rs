//! Downloads that failed, stalled or vanished: what they covered goes back to
//! missing so it is searched again, and a failed release is blocklisted for
//! its title so the next search skips it.

use anyhow::Result;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::HostStorage;
use rusqlite::params;

use crate::auto::title_kind;
use crate::rules::blocklist::{self, Blocked};

const HOUR_MS: i64 = 60 * 60 * 1000;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct FailureSummary {
    pub stalled: usize,
    pub blocklisted: usize,
    pub missing_again: usize,
}

/// One download as this pass reads it from the shared ledger.
#[derive(Debug, Clone)]
struct Download {
    id: String,
    kind: String,
    tmdb_id: u64,
    season: Option<u32>,
    episodes: Option<Vec<u32>>,
    release_title: String,
    info_hash: Option<String>,
    indexer_id: Option<String>,
    status: String,
    error: Option<String>,
    grabbed_at: i64,
}

impl Download {
    fn failed(&self) -> bool {
        matches!(self.status.as_str(), "failed" | "error")
    }

    fn live(&self) -> bool {
        !matches!(self.status.as_str(), "failed" | "error" | "removed")
    }

    fn unfinished(&self) -> bool {
        matches!(self.status.as_str(), "queued" | "downloading" | "paused")
    }

    fn covers(&self, row: &kroma_module_sdk::db::WantedRow) -> bool {
        if row.tmdb_id != self.tmdb_id || title_kind(&row.kind) != title_kind(&self.kind) {
            return false;
        }
        if row.kind == "movie" {
            return true;
        }
        row.season.is_some()
            && row.season == self.season
            && self
                .episodes
                .as_ref()
                .is_none_or(|eps| row.episode.is_some_and(|e| eps.contains(&e)))
    }
}

pub fn failure_pass<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<FailureSummary> {
    let now = now_ms();
    let mut summary = FailureSummary::default();
    let mut downloads = read_downloads(state)?;
    let stall_hours = state.setting_i64("acqStallHours", 72).max(0);
    for d in downloads
        .iter_mut()
        .filter(|d| stalled(d, now, stall_hours))
    {
        if let Err(e) = crate::peers::downloads::set_status(state, &d.id, "failed", Some("stalled"))
        {
            log(format!(
                "could not give up on \"{}\": {e:#}",
                d.release_title
            ));
            continue;
        }
        log(format!(
            "\"{}\" stalled for {stall_hours} h; giving up",
            d.release_title
        ));
        d.status = "failed".into();
        d.error = Some("stalled".into());
        summary.stalled += 1;
    }
    for d in downloads.iter().filter(|d| d.failed()) {
        if blocklist_once(state, d, now)? {
            summary.blocklisted += 1;
        }
    }
    let conn = state.db().get()?;
    let grabbed = kroma_module_sdk::db::wanted_in_status(&conn, "grabbed")?;
    drop(conn);
    let orphaned: Vec<String> = grabbed
        .iter()
        .filter(|row| !downloads.iter().any(|d| d.live() && d.covers(row)))
        .map(|row| row.id.clone())
        .collect();
    if !orphaned.is_empty() {
        kroma_module_sdk::db::set_wanted_status(state.db(), &orphaned, "wanted", now)?;
        kroma_module_sdk::db::reset_wanted_search(state.db(), &orphaned, now)?;
        log(format!(
            "{} episode(s) or film(s) lost their download; searching again",
            orphaned.len()
        ));
        state.trigger_job("acquisition.search", "download-failed");
    }
    summary.missing_again = orphaned.len();
    Ok(summary)
}

fn stalled(d: &Download, now: i64, stall_hours: i64) -> bool {
    stall_hours > 0 && d.unfinished() && now - d.grabbed_at >= stall_hours * HOUR_MS
}

fn blocklist_once<S: HostStorage>(state: &S, d: &Download, now: i64) -> Result<bool> {
    let conn = state.store().get()?;
    let fresh = conn.execute(
        "INSERT OR IGNORE INTO handled_failures (download_id, handled_at) VALUES (?1, ?2)",
        params![d.id, now],
    )? > 0;
    drop(conn);
    if !fresh || d.tmdb_id == 0 {
        return Ok(false);
    }
    let kind: RequestKind = title_kind(&d.kind);
    blocklist::add(
        state.store(),
        &Blocked {
            id: d.id.clone(),
            kind,
            tmdb_id: d.tmdb_id,
            release_title: d.release_title.clone(),
            info_hash: d.info_hash.clone(),
            indexer_id: d.indexer_id.clone(),
            reason: d.error.clone().unwrap_or_else(|| "failed".into()),
            added_at: now,
        },
    )?;
    Ok(true)
}

fn read_downloads<S: HostStorage>(state: &S) -> Result<Vec<Download>> {
    let conn = state.db().get()?;
    let mut stmt = conn.prepare(
        "SELECT id, kind, tmdb_id, season, episodes, release_title, info_hash, indexer_id, \
                status, error, grabbed_at FROM downloads",
    )?;
    let rows = stmt.query_map([], |r| {
        let episodes: Option<String> = r.get(4)?;
        Ok(Download {
            id: r.get(0)?,
            kind: r.get(1)?,
            tmdb_id: r.get::<_, i64>(2)? as u64,
            season: r.get(3)?,
            episodes: episodes.and_then(|e| serde_json::from_str(&e).ok()),
            release_title: r.get(5)?,
            info_hash: r.get(6)?,
            indexer_id: r.get(7)?,
            status: r.get(8)?,
            error: r.get(9)?,
            grabbed_at: r.get(10)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

#[cfg(test)]
mod tests;
