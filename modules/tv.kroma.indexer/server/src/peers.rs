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

use kroma_module_sdk::host::{call, call_raw, pinned_resolver, HostCtx, Resolver};
use kroma_module_sdk::http::address::web_target;

use crate::db::IndexerRow;
use crate::{Caps, Query, Release};

/// The point an indexer row that is not a Cardigann definition is served by.
/// This module defines it; a row's `kind` names the contribution that answers.
pub const ENGINE: &str = "tv.kroma.indexer/engine";

/// The local SOCKS5 bridge search traffic can be routed through, when the admin
/// opted in. Answered by whichever module runs one.
pub const VPN_PROXY: &str = "tv.kroma.vpn/proxy";

const VPN_NOT_RUNNING: &str =
    "indexers are set to go through the VPN, and no VPN is running: nothing is sent directly";

/// The proxy a request to `url` must take. `None` when the admin did not route
/// indexers through the VPN, or for a host on the local network the tunnel
/// cannot reach. An error when the VPN was asked for and is not running, so a
/// search never falls back to going out directly.
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
    let resolve = pinned_resolver(host, VPN_PROXY, None)?;
    call_raw(
        &resolve,
        &format!("{VPN_PROXY}/url"),
        &serde_json::json!({}),
    )
    .ok()
    .flatten()
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
mod tests {
    use kroma_module_sdk::host::testing::StubHost;

    use super::*;

    fn indexers_through_the_vpn() -> StubHost {
        StubHost::new().with_setting("acqIndexersUseVpn", serde_json::json!(true))
    }

    #[test]
    fn an_indexer_is_not_reached_directly_while_the_vpn_it_must_use_is_down() {
        let err = route_for(&indexers_through_the_vpn(), "https://tracker.example.org/")
            .unwrap_err()
            .to_string();

        assert!(err.contains("no VPN is running"), "{err}");
    }

    #[test]
    fn an_indexer_on_the_local_network_is_reached_directly_even_behind_the_vpn() {
        let route = route_for(&indexers_through_the_vpn(), "http://192.168.1.20:9117/api");

        assert_eq!(route.unwrap(), None);
    }

    #[test]
    fn without_the_vpn_option_an_indexer_is_reached_directly() {
        assert_eq!(
            route_for(&StubHost::new(), "https://tracker.example.org/").unwrap(),
            None
        );
    }

    fn endpoint() -> Endpoint {
        Endpoint {
            url: "http://jackett".into(),
            api_key: "k".into(),
            categories: vec![2000],
            proxy: None,
        }
    }

    fn body(query: &Query) -> serde_json::Value {
        let caps = Caps {
            search_tmdb: true,
            ..Default::default()
        };
        let endpoint = endpoint();
        serde_json::to_value(SearchReq {
            endpoint: &endpoint,
            query: wire_query(query),
            caps: &caps,
        })
        .unwrap()
    }

    #[test]
    fn a_movie_query_crosses_under_the_keys_the_provider_parses() {
        let json = body(&Query::Movie {
            tmdb_id: Some(603),
            imdb_id: None,
            title: "The Matrix".into(),
            year: Some(1999),
        });

        assert_eq!(json["endpoint"]["url"], "http://jackett");
        assert_eq!(json["endpoint"]["api_key"], "k");
        assert_eq!(json["endpoint"]["categories"][0], 2000);
        assert_eq!(json["caps"]["search_tmdb"], true);
        assert_eq!(json["query"]["Movie"]["tmdb_id"], 603);
        assert_eq!(json["query"]["Movie"]["title"], "The Matrix");
        assert_eq!(json["query"]["Movie"]["year"], 1999);
    }

    #[test]
    fn an_episode_query_carries_its_numbers() {
        let json = body(&Query::Episode {
            tmdb_id: None,
            title: "Severance".into(),
            season: 2,
            episode: 7,
        });

        assert_eq!(json["query"]["Episode"]["season"], 2);
        assert_eq!(json["query"]["Episode"]["episode"], 7);
    }

    #[test]
    fn a_free_text_query_crosses_as_a_titled_movie() {
        let json = body(&Query::Text {
            query: "some.release.name".into(),
        });

        assert_eq!(json["query"]["Movie"]["title"], "some.release.name");
        assert!(json["query"]["Movie"]["tmdb_id"].is_null());
    }

    // The provider sends fewer fields than this module's own richer release; the
    // rest have to default rather than fail the whole search.
    #[test]
    fn a_providers_leaner_release_deserializes() {
        let json = serde_json::json!({
            "title": "The.Matrix.1999.1080p",
            "guid": "g",
            "size_bytes": 42,
        });

        let release: Release = serde_json::from_value(json).unwrap();

        assert_eq!(release.title, "The.Matrix.1999.1080p");
        assert_eq!(release.size_bytes, Some(42));
        assert_eq!(release.grabs, None);
        assert!(release.categories.is_empty());
    }

    #[test]
    fn a_providers_volume_factors_reach_the_release_a_sweep_reads() {
        let json = serde_json::json!({
            "title": "The.Matrix.1999.1080p",
            "guid": "g",
            "download_volume_factor": 0.0,
            "upload_volume_factor": 2.0,
        });

        let release: Release = serde_json::from_value(json).unwrap();

        assert_eq!(release.download_volume_factor, Some(0.0));
        assert_eq!(release.upload_volume_factor, Some(2.0));
    }

    #[test]
    fn caps_deserialize_from_what_the_provider_reports() {
        let json = serde_json::json!({ "search_tmdb": true, "server_title": "Jackett" });

        let caps: Caps = serde_json::from_value(json).unwrap();

        assert!(caps.search_tmdb);
        assert!(!caps.tv_search_season);
        assert_eq!(caps.server_title.as_deref(), Some("Jackett"));
    }
}
