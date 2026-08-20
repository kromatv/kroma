//! The indexer data + built-in-search contract: the shared indexer row and the
//! ports the downloads / acquisition modules resolve so they don't depend on the
//! indexer crate. The search query/result types are the Torznab ones.

use kroma_module_host::HostCtx;

use super::{Query, Release};

mod client;
mod routes;

pub use client::*;
pub use routes::*;

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

/// The indexer module's authenticated `.torrent` fetch. Built-in Cardigann
/// indexers cookie-gate their downloads, so a bare fetch returns the login page;
/// this lets the downloads module grab the real file without depending on the
/// indexer crate.
pub trait TorrentFetchPort: Send + Sync {
    // Fetch the `.torrent` bytes for `url` through the indexer's authenticated
    // session. `None` when this indexer is not one the port handles (the caller
    // then does a plain HTTP fetch); `Some(Err)` when the authenticated fetch
    // itself failed.
    fn fetch_torrent(
        &self,
        host: &dyn HostCtx,
        indexer_id: &str,
        url: &str,
    ) -> Option<anyhow::Result<Vec<u8>>>;
}

/// The contract name for [`IndexerDbPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const INDEXER_DB: &str = "indexer-db";

/// The [`IndexerDbPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn indexer_db(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn IndexerDbPort>> {
    let endpoint = host.port_endpoint(INDEXER_DB)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(IndexerDbClient::new(resolve)))
}

/// The contract name for [`IndexerSearchPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const INDEXER_SEARCH: &str = "indexer-search";

/// The [`IndexerSearchPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn indexer_search(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn IndexerSearchPort>> {
    let endpoint = host.port_endpoint(INDEXER_SEARCH)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(IndexerSearchClient::new(resolve)))
}

/// The contract name for [`TorrentFetchPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const TORRENT_FETCH: &str = "torrent-fetch";

/// The [`TorrentFetchPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn torrent_fetch(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn TorrentFetchPort>> {
    let endpoint = host.port_endpoint(TORRENT_FETCH)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(TorrentFetchClient::new(resolve)))
}

#[cfg(test)]
pub(super) mod fixtures {
    use super::*;

    pub fn sample_row(id: &str) -> IndexerRow {
        IndexerRow {
            id: id.into(),
            name: "Name".into(),
            url: "http://indexer".into(),
            api_key: "key".into(),
            categories: vec![2000],
            enabled: true,
            priority: 1,
            kind: "builtin".into(),
            definition_id: Some("def".into()),
            settings: "{}".into(),
            last_ok_at: None,
            last_error: None,
            created_at: 0,
        }
    }

    pub struct OkDb;
    impl IndexerDbPort for OkDb {
        fn list_indexers(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
            Ok(vec![sample_row("a"), sample_row("b")])
        }
        fn enabled_indexers(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
            Ok(vec![sample_row("a")])
        }
        fn get_indexer(&self, _h: &dyn HostCtx, id: &str) -> anyhow::Result<Option<IndexerRow>> {
            Ok((id == "a").then(|| sample_row("a")))
        }
        fn note_indexer_result(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _ok: bool,
            _error: Option<&str>,
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            Ok(())
        }
    }

    pub struct ErrDb;
    impl IndexerDbPort for ErrDb {
        fn list_indexers(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
            Err(anyhow::anyhow!("boom"))
        }
        fn enabled_indexers(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
            Err(anyhow::anyhow!("boom"))
        }
        fn get_indexer(&self, _h: &dyn HostCtx, _id: &str) -> anyhow::Result<Option<IndexerRow>> {
            Err(anyhow::anyhow!("boom"))
        }
        fn note_indexer_result(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _ok: bool,
            _error: Option<&str>,
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            Err(anyhow::anyhow!("boom"))
        }
    }

    pub struct OkSearch;
    impl IndexerSearchPort for OkSearch {
        fn search(
            &self,
            _h: &dyn HostCtx,
            _row: &IndexerRow,
            _query: &Query,
            _categories: &[u32],
        ) -> anyhow::Result<SearchOutcome> {
            Ok(SearchOutcome { releases: Vec::new(), errors: vec!["partial".into()] })
        }
        fn resolve_download(
            &self,
            _h: &dyn HostCtx,
            _row: &IndexerRow,
            _title: &str,
            _details_url: Option<&str>,
            magnet_or_url: &str,
        ) -> anyhow::Result<DownloadTarget> {
            Ok(DownloadTarget::Magnet(magnet_or_url.to_string()))
        }
    }

    pub struct FetchMode(pub Option<Result<Vec<u8>, ()>>);
    impl TorrentFetchPort for FetchMode {
        fn fetch_torrent(
            &self,
            _h: &dyn HostCtx,
            _indexer_id: &str,
            _url: &str,
        ) -> Option<anyhow::Result<Vec<u8>>> {
            match &self.0 {
                None => None,
                Some(Ok(bytes)) => Some(Ok(bytes.clone())),
                Some(Err(())) => Some(Err(anyhow::anyhow!("fetch failed"))),
            }
        }
    }
}
