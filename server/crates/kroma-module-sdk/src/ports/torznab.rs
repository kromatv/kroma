//! The Torznab search protocol contract: the endpoint config, query/result/caps
//! types, and the `TorznabPort` a consumer resolves to run searches. Lives here
//! so the indexer / acquisition modules use the types + port instead of naming
//! the torznab crate. The torznab crate implements the port over HTTP.

use serde::{Deserialize, Serialize};

// The coarse Torznab category bucket; sub-categories (2040 HD, 2045 UHD...)
// are the indexer's business.
pub const CAT_MOVIES: u32 = 2000;
pub const CAT_TV: u32 = 5000;

/// A configured Torznab endpoint (crate-owned config type; the server maps its
/// DB row into this).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct IndexerEndpoint {
    pub url: String,
    pub api_key: String,
    pub categories: Vec<u32>,
}

/// One search request. Build via the constructors so the query strategy
/// (id-based first, free-text fallback) stays in one place.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Query {
    Movie { tmdb_id: Option<u64>, imdb_id: Option<String>, title: String, year: Option<u32> },
    Episode { tmdb_id: Option<u64>, title: String, season: u32, episode: u32 },
    Season { tmdb_id: Option<u64>, title: String, season: u32 },
}

/// A normalized Torznab result item.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
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
}

/// What an indexer advertises via `t=caps`: which query parameters its
/// backing tracker actually understands (not all support `tmdbid`).
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Caps {
    pub search_tmdb: bool,
    pub search_imdb: bool,
    pub tv_search_tmdb: bool,
    pub server_title: Option<String>,
}

/// Runs Torznab searches for a configured endpoint. Implemented by the torznab
/// crate (over HTTP/XML) and resolved via `kroma_module_host::resolve_port`.
pub trait TorznabPort: Send + Sync {
    // Fetch `t=caps` (also the admin test-connection call).
    fn caps(&self, endpoint: &IndexerEndpoint) -> anyhow::Result<Caps>;
    // Run one query against one indexer and normalize the results.
    fn search(
        &self,
        endpoint: &IndexerEndpoint,
        query: &Query,
        caps: &Caps,
    ) -> anyhow::Result<Vec<Release>>;
}
