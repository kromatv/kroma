//! The types this module reads and writes, including on the `torznab` point.
//!
//! They are this module's own. A consumer declares the fields it reads and
//! nothing else: the two ends ship on separate tags at separate versions and the
//! operator installs whichever pair they installed, so a shared Rust type would
//! prove the ends agreed at build time in this repo and nothing about the pair
//! actually running. Tolerance is the contract, and [`port`](crate::port) pins
//! the JSON.

use serde::{Deserialize, Serialize};

// The coarse Torznab category bucket; sub-categories (2040 HD, 2045 UHD...)
// are the indexer's business.
pub const CAT_MOVIES: u32 = 2000;
pub const CAT_TV: u32 = 5000;

/// A configured Torznab endpoint, as a consumer sends it with each call.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct IndexerEndpoint {
    pub url: String,
    pub api_key: String,
    pub categories: Vec<u32>,
}

/// One search request. Externally tagged, so the variant name is part of the
/// wire: `{"Movie":{"tmdb_id":603,...}}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Query {
    Movie { tmdb_id: Option<u64>, imdb_id: Option<String>, title: String, year: Option<u32> },
    Episode { tmdb_id: Option<u64>, title: String, season: u32, episode: u32 },
    Season { tmdb_id: Option<u64>, title: String, season: u32 },
}

/// A normalized Torznab result item.
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
}

/// What an indexer advertises via `t=caps`: which query parameters its backing
/// tracker actually understands (not all support `tmdbid`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Caps {
    pub search_tmdb: bool,
    pub search_imdb: bool,
    pub tv_search_tmdb: bool,
    // `tv-search` accepting `season` (and `ep`) with a plain `q`. The common case
    // by far: most trackers behind Jackett/Prowlarr resolve no external ids at
    // all, and without this the only tv query left is free text.
    pub tv_search_season: bool,
    pub server_title: Option<String>,
}
