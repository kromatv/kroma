//! The indexer data + built-in-search contract: the shared indexer row and the
//! ports the downloads / acquisition modules resolve so they don't depend on the
//! indexer crate. The search query/result types are the Torznab ones.

use kroma_module_host::HostCtx;

use super::{Query, Release};

/// A stored indexer row, including the secret; internal only.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexerRow {
    pub id: String,
    pub name: String,
    pub url: String,
    pub api_key: String,
    pub categories: Vec<u32>,
    pub enabled: bool,
    pub priority: i32,
    pub kind: String,
    pub definition_id: Option<String>,
    pub settings: String,
    pub last_ok_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
}

/// Implemented by the indexer module, which owns the `indexers` table.
pub trait IndexerDbPort: Send + Sync {
    fn list_indexers(&self, host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>>;
    fn enabled_indexers(&self, host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>>;
    fn get_indexer(&self, host: &dyn HostCtx, id: &str) -> anyhow::Result<Option<IndexerRow>>;
    fn note_indexer_result(
        &self,
        host: &dyn HostCtx,
        id: &str,
        ok: bool,
        error: Option<&str>,
        now_ms: i64,
    ) -> anyhow::Result<()>;
}

pub const KIND_BUILTIN: &str = "builtin";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum DownloadTarget {
    Magnet(String),
    TorrentUrl(String),
}

/// A per-path error alongside real results is not fatal.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchOutcome {
    pub releases: Vec<Release>,
    pub errors: Vec<String>,
}

/// Implemented by the indexer module, which owns the Cardigann sessions.
pub trait IndexerSearchPort: Send + Sync {
    // Native Cardigann or external Torznab, dispatched internally.
    fn search(
        &self,
        host: &dyn HostCtx,
        row: &IndexerRow,
        query: &Query,
        categories: &[u32],
    ) -> anyhow::Result<SearchOutcome>;
    fn resolve_download(
        &self,
        host: &dyn HostCtx,
        row: &IndexerRow,
        title: &str,
        details_url: Option<&str>,
        magnet_or_url: &str,
    ) -> anyhow::Result<DownloadTarget>;
}
