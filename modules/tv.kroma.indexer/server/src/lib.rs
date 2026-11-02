//! Native Cardigann indexer engine: runs Cardigann YAML tracker definitions
//! directly, as an alternative to Torznab/Jackett/Prowlarr. Definitions are
//! GPL and fetched at runtime by [`store`], not vendored into this repo.

#![allow(clippy::result_large_err)]

#[cfg(target_family = "wasm")]
extern crate kroma_sqlite_guest as rusqlite;

use serde::{Deserialize, Serialize};

pub mod admin;
pub mod category;
pub mod context;
pub mod db;
pub mod definition;
pub mod dtos;
pub mod engine;
pub mod filters;
pub mod module;
pub mod peers;
pub mod port;
pub mod routes;
pub mod search;
pub mod selector;
pub mod session;
pub mod store;
pub mod template;
pub mod xmltree;
#[cfg(feature = "xpath")]
pub mod xpath;

pub use dtos::*;

pub use session::{DownloadTarget, SearchOutcome, Session};

pub use definition::Definition;
pub use module::MODULE;

pub const MODULE_ID: &str = "tv.kroma.indexer";

/// The Indexers sub-module: exposes the native-engine admin routes over the
/// HostCtx seam. Lifecycle-free (disabling it just gates its routes off).
pub struct IndexersModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for IndexersModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        db::MIGRATIONS
    }

    fn steps(&self) -> &'static [kroma_module_sdk::db::Step] {
        db::STEPS
    }

    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        Some(routes::routes::<S>())
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(IndexersModule)
}

/// A configured built-in indexer: the chosen base link plus admin-entered
/// settings (`.Config.<name>` resolves against this, falling back to definition defaults).
#[derive(Debug, Clone, Default)]
pub struct IndexerConfig {
    pub base_url: String,
    pub settings: std::collections::HashMap<String, String>,
}

/// One search request, for either engine. `Text` is the native engine's own: the
/// `torznab` point has no free-text variant, so [`peers`] maps it.
#[derive(Debug, Clone, PartialEq, Eq)]
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
    Text {
        query: String,
    },
}

impl Query {
    /// The title alone, with no season/episode tag. What `{{ .Keywords }}` must
    /// expand to for a definition that sends the numbers as their own inputs.
    pub fn title(&self) -> String {
        match self {
            Query::Movie { title, year, .. } => match year {
                Some(y) => format!("{title} {y}"),
                None => title.clone(),
            },
            Query::Episode { title, .. } | Query::Season { title, .. } => title.clone(),
            Query::Text { query } => query.clone(),
        }
    }

    /// The free-text keywords a definition's `{{ .Keywords }}` expands to.
    pub fn keywords(&self) -> String {
        match self {
            Query::Movie { title, year, .. } => match year {
                Some(y) => format!("{title} {y}"),
                None => title.clone(),
            },
            Query::Episode {
                title,
                season,
                episode,
                ..
            } => {
                format!("{title} S{season:02}E{episode:02}")
            }
            Query::Season { title, season, .. } => format!("{title} S{season:02}"),
            Query::Text { query } => query.clone(),
        }
    }
}

/// A normalized release: the fields every engine reports plus the richer
/// attributes Cardigann exposes (categories, freeleech factors).
///
/// Tolerant on purpose. It carries answers from the `torznab` point, whose
/// provider is a separately released module that knows nothing of the extra
/// fields, so a missing one has to default rather than fail the whole search.
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
    pub grabs: Option<u32>,
    pub tmdb_id: Option<u64>,
    pub imdb_id: Option<String>,
    pub published_at: Option<String>,
    pub details_url: Option<String>,
    pub categories: Vec<u32>,
    pub download_volume_factor: Option<f64>,
    pub upload_volume_factor: Option<f64>,
}

/// What an indexer advertises it can do: derived from `caps.modes` for a
/// definition, read off the `torznab` point for an external endpoint. Serde
/// because it crosses that point, and tolerant because the two ends version
/// apart.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Caps {
    pub search_tmdb: bool,
    pub search_imdb: bool,
    pub tv_search_tmdb: bool,
    pub tv_search_season: bool,
    pub server_title: Option<String>,
}

impl Caps {
    pub fn from_definition(def: &Definition) -> Self {
        let has = |mode: &str, param: &str| {
            def.caps
                .modes
                .get(mode)
                .is_some_and(|params| params.iter().any(|p| p == param))
        };
        Caps {
            search_imdb: has("movie-search", "imdbid") || has("search", "imdbid"),
            search_tmdb: has("movie-search", "tmdbid") || has("search", "tmdbid"),
            tv_search_tmdb: has("tv-search", "tmdbid"),
            tv_search_season: has("tv-search", "season"),
            server_title: Some(def.name.clone()),
        }
    }
}

#[cfg(test)]
mod tests;
