//! The `download-grab` and `download-db` points this module calls: hand over a
//! release to grab, then work the ledger the import pass reads.

use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{call, call_raw, pinned_resolver, HostCtx, Resolver};

pub const DOWNLOAD_GRAB: &str = "tv.kroma.torrents/grab";

pub const DOWNLOAD_DB: &str = "tv.kroma.torrents/db";

/// Everything the queue needs to grab a release and let it be imported.
/// `upgrade` means it replaces media already on disk, so the import takes the
/// destination and clears what it superseded instead of landing beside it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct GrabSpec {
    pub magnet_or_url: String,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub request_id: Option<String>,
    pub wanted_ids: Vec<String>,
    pub only_files: Option<Vec<usize>>,
    pub details_url: Option<String>,
    pub upgrade: bool,
}

/// A ledger row, as the import pass reads it. Tolerant: the module that keeps the
/// ledger is released separately, so a field it adds is ignored here and one it
/// stops sending defaults rather than failing the whole import sweep.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DownloadRow {
    pub id: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub magnet_or_url: String,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub status: String,
    pub save_path: Option<String>,
    pub error: Option<String>,
    pub details_url: Option<String>,
    pub only_files: Option<Vec<usize>>,
    pub upgrade: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TorrentFileEntry {
    pub index: usize,
    pub path: String,
    pub size_bytes: u64,
}

pub fn grab(host: &dyn HostCtx, spec: &GrabSpec) -> anyhow::Result<DownloadRow> {
    call(&grabber(host)?, &format!("{DOWNLOAD_GRAB}/grab"), spec)
}

/// A torrent's files without downloading it, so the admin can select before
/// committing.
pub fn list_files(
    host: &dyn HostCtx,
    magnet_or_url: &str,
) -> anyhow::Result<Vec<TorrentFileEntry>> {
    call(
        &grabber(host)?,
        &format!("{DOWNLOAD_GRAB}/list-files"),
        &serde_json::json!({ "magnet_or_url": magnet_or_url }),
    )
}

/// Whether the kill switch currently allows new grabs. A missing engine reads as
/// closed, because a grab that cannot be handed anywhere is not a grab.
pub fn gate_open(host: &dyn HostCtx) -> bool {
    let Ok(resolve) = grabber(host) else {
        return false;
    };
    call_raw(
        &resolve,
        &format!("{DOWNLOAD_GRAB}/gate-open"),
        &serde_json::json!({}),
    )
    .unwrap_or(false)
}

/// Kick a freshly recorded row into the engine. Best effort: the row is already in
/// the ledger, so the engine picks it up on its next sweep either way.
pub fn activate(host: &dyn HostCtx, id: &str) {
    if let Err(e) = lifecycle(host, "activate", id) {
        tracing::warn!(target: "acquisition", download = %id, "could not start the download: {e:#}");
    }
}

/// Free a download's data and stop seeding, once its files were imported.
pub fn drop_data(host: &dyn HostCtx, id: &str) {
    if let Err(e) = lifecycle(host, "drop-data", id) {
        tracing::warn!(target: "acquisition", download = %id, "could not free the download: {e:#}");
    }
}

fn lifecycle(host: &dyn HostCtx, method: &str, id: &str) -> anyhow::Result<bool> {
    call(
        &grabber(host)?,
        &format!("{DOWNLOAD_GRAB}/{method}"),
        &serde_json::json!({ "id": id }),
    )
}

/// Rows the engine finished and nothing has imported yet.
pub fn completed(host: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/completed"),
        &serde_json::json!({}),
    )
}

/// Record where an import landed a row's files.
pub fn mark_imported(
    host: &dyn HostCtx,
    id: &str,
    paths: &[String],
    now_ms: i64,
) -> anyhow::Result<()> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/mark-imported"),
        &serde_json::json!({ "id": id, "paths": paths, "now_ms": now_ms }),
    )
}

/// Move a row to `status`, with the reason when it failed.
pub fn set_status(
    host: &dyn HostCtx,
    id: &str,
    status: &str,
    error: Option<&str>,
) -> anyhow::Result<bool> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/set-status"),
        &serde_json::json!({ "id": id, "status": status, "error": error }),
    )
}

fn grabber(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, DOWNLOAD_GRAB)
}

fn ledger(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, DOWNLOAD_DB)
}

fn resolve(host: &dyn HostCtx, point: &str) -> anyhow::Result<Resolver> {
    pinned_resolver(host, point, None)
        .ok_or_else(|| anyhow::anyhow!("no module answers the {point} point"))
}

#[cfg(test)]
mod tests;
