//! Calls out to the engine point this module DEFINES, for the indexer rows that
//! are served by a plugged-in engine rather than a Cardigann definition.
//!
//! A row's `kind` is the instance name, so a module contributing a protocol
//! nobody here has heard of is reached with nothing changed on this side.
//!
//! The structs here are this module's own: it declares what it sends and reads
//! the fields it needs out of the answer, so nothing links whichever module
//! answers the point. [`tests`] pins the JSON against the shape the provider
//! parses.

use serde::Serialize;

use kroma_module_sdk::host::{call, NetworkSeal, pinned_resolver, HostCtx, Resolver};
use kroma_module_sdk::http::address::web_target;

use crate::db::IndexerRow;
use crate::{Caps, Query, Release};

/// The point an indexer row that is not a Cardigann definition is served by.
/// This module defines it; a row's `kind` names the contribution that answers.
pub const ENGINE: &str = "tv.kroma.indexer/engine";

const VPN_NOT_RUNNING: &str =
    "indexers are set to go through the VPN, and no VPN is running: nothing is sent directly";

const SEALED_BY_THE_HOST: &str = "sealed-by-the-host";

/// The proxy a request to `url` must take: `None` when indexers are not routed
/// through the VPN or the host is on the local network. An error when the VPN
/// is asked for and not running, so a search never goes out directly.
pub fn route_for(host: &dyn HostCtx, url: &str) -> anyhow::Result<Option<String>> {
    if !host.setting_bool("acqIndexersUseVpn", false) {
        return Ok(None);
    }
    if web_target(url).is_some_and(|target| target.is_local()) {
        return Ok(None);
    }
    proxy_url(host)
        .map(Some)
        .ok_or_else(|| anyhow::anyhow!(VPN_NOT_RUNNING))
}

fn proxy_url(host: &dyn HostCtx) -> Option<String> {
    (host.network_seal() == NetworkSeal::Up).then(|| SEALED_BY_THE_HOST.to_string())
}

/// One configured endpoint, as the point wants it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Endpoint {
    pub url: String,
    pub api_key: String,
    pub categories: Vec<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy: Option<String>,
}

/// The endpoint fields of an indexer row, with the proxy [`route_for`] chose.
pub fn endpoint_of(host: &dyn HostCtx, row: &IndexerRow) -> anyhow::Result<Endpoint> {
    Ok(Endpoint {
        url: row.url.clone(),
        api_key: row.api_key.clone(),
        categories: row.categories.clone(),
        proxy: route_for(host, &row.url)?,
    })
}

/// Probe an endpoint's capabilities, which is also the admin test-connection
/// call. `kind` selects the engine.
pub fn caps(host: &dyn HostCtx, kind: &str, endpoint: &Endpoint) -> anyhow::Result<Caps> {
    call(&resolve(host, kind)?, &format!("{ENGINE}/caps"), endpoint)
}

/// Run one query against one configured endpoint.
pub fn search(
    host: &dyn HostCtx,
    kind: &str,
    endpoint: &Endpoint,
    query: &Query,
    caps: &Caps,
) -> anyhow::Result<Vec<Release>> {
    let body = SearchReq {
        endpoint,
        query: wire_query(query),
        caps,
    };
    call(&resolve(host, kind)?, &format!("{ENGINE}/search"), &body)
}

fn resolve(host: &dyn HostCtx, kind: &str) -> anyhow::Result<Resolver> {
    pinned_resolver(host, ENGINE, Some(kind))
        .ok_or_else(|| anyhow::anyhow!("no module answers {ENGINE} as {kind}"))
}

#[derive(Serialize)]
struct SearchReq<'a> {
    endpoint: &'a Endpoint,
    query: WireQuery<'a>,
    caps: &'a Caps,
}

// The point's query language has no free-text variant: a tracker reached over
// Torznab searches by keywords anyway, so `Text` crosses as a titled movie
// query and the provider's own fallback takes it from there.
#[derive(Serialize)]
enum WireQuery<'a> {
    Movie {
        tmdb_id: Option<u64>,
        imdb_id: Option<&'a str>,
        title: &'a str,
        year: Option<u32>,
    },
    Episode {
        tmdb_id: Option<u64>,
        title: &'a str,
        season: u32,
        episode: u32,
    },
    Season {
        tmdb_id: Option<u64>,
        title: &'a str,
        season: u32,
    },
}

fn wire_query(query: &Query) -> WireQuery<'_> {
    match query {
        Query::Movie {
            tmdb_id,
            imdb_id,
            title,
            year,
        } => WireQuery::Movie {
            tmdb_id: *tmdb_id,
            imdb_id: imdb_id.as_deref(),
            title,
            year: *year,
        },
        Query::Episode {
            tmdb_id,
            title,
            season,
            episode,
        } => WireQuery::Episode {
            tmdb_id: *tmdb_id,
            title,
            season: *season,
            episode: *episode,
        },
        Query::Season {
            tmdb_id,
            title,
            season,
        } => WireQuery::Season {
            tmdb_id: *tmdb_id,
            title,
            season: *season,
        },
        Query::Text { query } => WireQuery::Movie {
            tmdb_id: None,
            imdb_id: None,
            title: query,
            year: None,
        },
    }
}

#[cfg(test)]
mod tests;
