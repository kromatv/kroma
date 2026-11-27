//! Downloads that failed, stalled or vanished: what they covered goes back to
//! missing so it is searched again, and a failed release is blocklisted for
//! its title so the next search skips it.

use std::collections::HashMap;

use anyhow::Result;
use kroma_module_sdk::db::WantedRow;
use kroma_module_sdk::domain::RequestKind;
use kroma_module_sdk::primitives::now_ms;
use kroma_module_sdk::host::HostStorage;
use rusqlite::params;

use crate::auto::title_kind;
use crate::rules::blocklist::{self, Blocked};

mod progress;

const HOUR_MS: i64 = 60 * 60 * 1000;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct FailureSummary {
    pub stalled: usize,
    pub blocklisted: usize,
    pub missing_again: usize,
    pub held_back: usize,
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
    client_ref: String,
    status: String,
    error: Option<String>,
    progress: f64,
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

    fn never_reached_a_client(&self) -> bool {
        self.failed() && self.client_ref.is_empty()
    }

    fn covers(&self, row: &WantedRow) -> bool {
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
    let moved_at = last_progress(state, &downloads, now)?;
    for d in downloads
        .iter_mut()
        .filter(|d| stalled(d, moved_at.get(&d.id).copied(), now, stall_hours))
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
            "\"{}\" made no progress for {stall_hours} h; giving up",
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
    let lost = Lost::among(&grabbed, &downloads);
    lost.back_to_wanted(state, now, log)?;
    summary.missing_again = lost.orphaned.len() + lost.held.len();
    summary.held_back = lost.held.len();
    Ok(summary)
}

struct Lost {
    orphaned: Vec<String>,
    held: Vec<String>,
}

impl Lost {
    fn among(grabbed: &[WantedRow], downloads: &[Download]) -> Self {
        let (held, orphaned): (Vec<&WantedRow>, Vec<&WantedRow>) = grabbed
            .iter()
            .filter(|row| !downloads.iter().any(|d| d.live() && d.covers(row)))
            .partition(|row| failed_twice_before_a_client(downloads, row));
        Self {
            orphaned: ids_of(&orphaned),
            held: ids_of(&held),
        }
    }

    fn back_to_wanted<S: HostStorage>(
        &self,
        state: &S,
        now: i64,
        log: &dyn Fn(String),
    ) -> Result<()> {
        let all: Vec<String> = self.orphaned.iter().chain(&self.held).cloned().collect();
        kroma_module_sdk::db::set_wanted_status(state.db(), &all, "wanted", now)?;
        if !self.held.is_empty() {
            log(format!(
                "{} episode(s) or film(s) lost two downloads in a row before a client took either; searching again after the usual wait",
                self.held.len()
            ));
        }
        if self.orphaned.is_empty() {
            return Ok(());
        }
        kroma_module_sdk::db::reset_wanted_search(state.db(), &self.orphaned, now)?;
        log(format!(
            "{} episode(s) or film(s) lost their download; searching again",
            self.orphaned.len()
        ));
        state.trigger_job("acquisition.search", "download-failed");
        Ok(())
    }
}

fn failed_twice_before_a_client(downloads: &[Download], row: &WantedRow) -> bool {
    let mut covering: Vec<&Download> = downloads.iter().filter(|d| d.covers(row)).collect();
    covering.sort_by_key(|d| std::cmp::Reverse(d.grabbed_at));
    covering.len() >= 2 && covering[..2].iter().all(|d| d.never_reached_a_client())
}

fn ids_of(rows: &[&WantedRow]) -> Vec<String> {
    rows.iter().map(|row| row.id.clone()).collect()
}

fn stalled(d: &Download, moved_at: Option<i64>, now: i64, stall_hours: i64) -> bool {
    let since = moved_at.unwrap_or(d.grabbed_at);
    stall_hours > 0 && d.unfinished() && now - since >= stall_hours * HOUR_MS
}

fn last_progress<S: HostStorage>(
    state: &S,
    downloads: &[Download],
    now: i64,
) -> Result<HashMap<String, i64>> {
    let live: Vec<String> = downloads.iter().map(|d| d.id.clone()).collect();
    progress::forget_all_but(state.store(), &live)?;
    downloads
        .iter()
        .map(|d| {
            let at = progress::note(state.store(), &d.id, d.progress, now)?;
            Ok((d.id.clone(), at.min(now).max(d.grabbed_at)))
        })
        .collect()
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
                status, error, progress, grabbed_at, client_ref FROM downloads",
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
            progress: r.get(10)?,
            grabbed_at: r.get(11)?,
            client_ref: r.get(12)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

#[cfg(test)]
mod tests;
