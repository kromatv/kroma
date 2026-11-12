//! The `indexer-db` and `indexer-search` points this module calls: which
//! indexers to sweep, the search itself, and resolving a chosen release's link.
//!
//! An indexer is named by ID. Its base URL, API key and settings JSON belong to
//! the module that keeps them and never reach this one, which is why
//! [`IndexerRef`] is four fields rather than thirteen.

use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{call, pinned_resolver, HostCtx, Resolver};
use kroma_module_sdk::http::{Loopback, Response};

/// A release as an indexer reports it. Tolerant: the provider is separately
/// released, so a field it adds is ignored here and one it stops sending
/// defaults rather than dropping the whole sweep.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Release {
    pub title: String,
    pub guid: String,
    pub link: Option<String>,
    pub magnet: Option<String>,
    pub info_hash: Option<String>,
    pub size_bytes: Option<u64>,
    pub seeders: Option<u32>,
    pub leechers: Option<u32>,
    pub tmdb_id: Option<u64>,
    pub imdb_id: Option<String>,
    pub published_at: Option<String>,
    pub details_url: Option<String>,
    pub download_volume_factor: Option<f64>,
    pub upload_volume_factor: Option<f64>,
}

/// The configured indexers and their per-sweep result.
pub const INDEXER_DB: &str = "tv.kroma.indexer/db";

/// Running a search, and resolving a release's download link.
pub const INDEXER_SEARCH: &str = "tv.kroma.indexer/search";

/// The `kind` of a Cardigann-definition indexer. A grab from one needs the
/// provider's authenticated fetch rather than a plain HTTP GET.
pub const KIND_BUILTIN: &str = "builtin";

/// An indexer, as much of one as a sweep needs: what to call it in a report, and
/// what order to prefer it in.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct IndexerRef {
    pub id: String,
    pub name: String,
    pub kind: String,
    /// Higher wins when two indexers offer the same release.
    pub priority: i32,
    pub enabled: bool,
}

/// One search request. Externally tagged, so the variant name is part of the wire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Query {
    Movie {
        tmdb_id: Option<u64>,
        imdb_id: Option<String>,
        title: String,
        year: Option<u32>,
    },
    Episode {
        tmdb_id: Option<u64>,
        title: String,
        season: u32,
        episode: u32,
    },
    Season {
        tmdb_id: Option<u64>,
        title: String,
        season: u32,
    },
    /// Free text; empty asks for the indexer's latest releases.
    Text {
        query: String,
    },
}

/// One indexer's answer. A per-indexer error alongside real results is not fatal:
/// the sweep reports it and keeps what the others returned.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct SearchOutcome {
    pub releases: Vec<Release>,
    pub errors: Vec<String>,
}

/// Where a release's bytes come from.
#[derive(Debug, Clone, Deserialize)]
pub enum DownloadTarget {
    Magnet(String),
    TorrentUrl(String),
}

impl DownloadTarget {
    /// The link either variant carries, which is all a grab needs.
    pub fn link(self) -> String {
        match self {
            DownloadTarget::Magnet(m) => m,
            DownloadTarget::TorrentUrl(u) => u,
        }
    }
}

/// Every configured indexer, enabled or not.
pub fn list(host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRef>> {
    call(
        &db(host)?,
        &format!("{INDEXER_DB}/list"),
        &serde_json::json!({}),
    )
}

/// The indexers a sweep should ask.
pub fn enabled(host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRef>> {
    call(
        &db(host)?,
        &format!("{INDEXER_DB}/enabled"),
        &serde_json::json!({}),
    )
}

/// One indexer, or `None` when nothing has that id (a row can outlive a release
/// that names it).
pub fn get(host: &dyn HostCtx, id: &str) -> anyhow::Result<Option<IndexerRef>> {
    call(
        &db(host)?,
        &format!("{INDEXER_DB}/get"),
        &serde_json::json!({ "id": id }),
    )
}

/// Record how an indexer answered, so the admin sees which one stopped working.
pub fn note_result(
    host: &dyn HostCtx,
    id: &str,
    ok: bool,
    error: Option<&str>,
    now_ms: i64,
) -> anyhow::Result<()> {
    call(
        &db(host)?,
        &format!("{INDEXER_DB}/note-result"),
        &serde_json::json!({ "id": id, "ok": ok, "error": error, "now_ms": now_ms }),
    )
}

/// Search one indexer. Its own configured categories are used, which is what the
/// caller wants in every case here.
pub fn search(
    host: &dyn HostCtx,
    indexer_id: &str,
    query: &Query,
) -> anyhow::Result<SearchOutcome> {
    call(
        &search_at(host)?,
        &format!("{INDEXER_SEARCH}/search"),
        &search_body(indexer_id, query),
    )
}

/// [`search`], each `(indexer_id, query)` at once and none waiting on another.
/// One answer per ask, in the same order.
pub fn search_all(host: &dyn HostCtx, asks: &[(&str, &Query)]) -> Vec<anyhow::Result<SearchOutcome>> {
    let endpoint = search_at(host).and_then(|resolve| {
        resolve().ok_or_else(|| anyhow::anyhow!("no module contributes this point"))
    });
    let (base, token) = match endpoint {
        Ok(found) => found,
        Err(e) => {
            let reason = format!("{e:#}");
            return asks
                .iter()
                .map(|_| Err(anyhow::anyhow!(reason.clone())))
                .collect();
        }
    };
    let url = format!("{base}/_port/{INDEXER_SEARCH}/search");
    let calls: Vec<(String, serde_json::Value)> = asks
        .iter()
        .map(|(indexer_id, query)| (url.clone(), search_body(indexer_id, query)))
        .collect();
    Loopback::new()
        .header("authorization", format!("Bearer {token}"))
        .post_json_all(&calls)
        .into_iter()
        .map(read_outcome)
        .collect()
}

fn search_body(indexer_id: &str, query: &Query) -> serde_json::Value {
    serde_json::json!({ "indexer_id": indexer_id, "query": query })
}

fn read_outcome(answer: anyhow::Result<Response>) -> anyhow::Result<SearchOutcome> {
    let out: Result<SearchOutcome, String> = answer?.ensure_ok()?.json()?;
    out.map_err(|e| anyhow::anyhow!(e))
}

/// Turn a chosen release into the link to hand a download engine.
pub fn resolve_download(
    host: &dyn HostCtx,
    indexer_id: &str,
    title: &str,
    details_url: Option<&str>,
    magnet_or_url: &str,
) -> anyhow::Result<DownloadTarget> {
    call(
        &search_at(host)?,
        &format!("{INDEXER_SEARCH}/resolve-download"),
        &serde_json::json!({
            "indexer_id": indexer_id,
            "title": title,
            "details_url": details_url,
            "magnet_or_url": magnet_or_url,
        }),
    )
}

fn db(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, INDEXER_DB)
}

fn search_at(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, INDEXER_SEARCH)
}

fn resolve(host: &dyn HostCtx, point: &str) -> anyhow::Result<Resolver> {
    pinned_resolver(host, point, None)
        .ok_or_else(|| anyhow::anyhow!("no module answers the {point} point"))
}

#[cfg(test)]
mod tests;
