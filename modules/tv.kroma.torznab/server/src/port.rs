//! The `torznab` point, served over the wire.
//!
//! There is no trait and no shared client crate: a consumer POSTs to
//! `/_port/tv.kroma.indexer/engine/<method>` with the fields below and reads what it needs out of
//! the answer. What this module owes its consumers is that the JSON keeps its
//! shape, which the tests at the bottom pin.

use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_host::port_reply;

use crate::types::{Caps, IndexerEndpoint, Query, Release};

/// The point name a consumer asks the host for. Whichever module declares it
/// answers; nobody names this module.
pub const POINT: &str = "tv.kroma.indexer/engine";

/// The point's routes, merged into the module process's router (see
/// `kroma_module_runtime::serve`'s `extra`).
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.indexer/engine/caps", post(caps))
        .route("/_port/tv.kroma.indexer/engine/search", post(search))
}

async fn caps(Json(endpoint): Json<IndexerEndpoint>) -> Json<Result<Caps, String>> {
    port_reply(move || crate::caps(&endpoint)).await
}

#[derive(Deserialize)]
struct SearchReq {
    #[serde(default)]
    endpoint: IndexerEndpoint,
    query: Query,
    #[serde(default)]
    caps: Caps,
}

async fn search(Json(req): Json<SearchReq>) -> Json<Result<Vec<Release>, String>> {
    port_reply(move || crate::search(&req.endpoint, &req.query, &req.caps)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde_json::json;

    // A consumer builds this body by hand, in its own crate, from its own
    // structs. A rename here has to fail here, not in someone's install.
    #[test]
    fn a_search_request_is_the_json_a_consumer_sends() {
        let body = json!({
            "endpoint": { "url": "http://jackett", "api_key": "k", "categories": [2000] },
            "query": { "Movie": { "tmdb_id": 603, "imdb_id": null, "title": "The Matrix", "year": 1999 } },
            "caps": { "search_tmdb": true },
        });

        let req: SearchReq = serde_json::from_value(body).unwrap();

        assert_eq!(req.endpoint.url, "http://jackett");
        assert_eq!(req.endpoint.categories, vec![2000]);
        assert!(req.caps.search_tmdb);
        assert!(matches!(req.query, Query::Movie { tmdb_id: Some(603), .. }));
    }

    #[test]
    fn an_episode_query_carries_its_season_and_episode() {
        let body = json!({
            "query": { "Episode": { "tmdb_id": null, "title": "Severance", "season": 2, "episode": 7 } },
        });

        let req: SearchReq = serde_json::from_value(body).unwrap();

        assert!(matches!(req.query, Query::Episode { season: 2, episode: 7, .. }));
    }

    // The endpoint and caps default so a consumer that has not probed caps yet
    // still gets a free-text search rather than a 422.
    #[test]
    fn a_request_with_only_a_query_is_enough() {
        let body = json!({ "query": { "Season": { "tmdb_id": null, "title": "Andor", "season": 1 } } });

        let req: SearchReq = serde_json::from_value(body).unwrap();

        assert_eq!(req.endpoint, IndexerEndpoint::default());
        assert_eq!(req.caps, Caps::default());
    }

    #[test]
    fn a_release_serializes_under_the_keys_a_consumer_reads() {
        let release = Release {
            title: "The.Matrix.1999.1080p".into(),
            guid: "g".into(),
            size_bytes: Some(42),
            seeders: Some(9),
            ..Default::default()
        };

        let json = serde_json::to_value(&release).unwrap();

        assert_eq!(json["title"], "The.Matrix.1999.1080p");
        assert_eq!(json["guid"], "g");
        assert_eq!(json["size_bytes"], 42);
        assert_eq!(json["seeders"], 9);
        assert!(json["magnet"].is_null());
    }

    // An older consumer must survive a field this module adds later, and a newer
    // one must survive a field an older provider does not send.
    #[test]
    fn an_unknown_field_is_ignored_and_a_missing_one_defaults() {
        let json = json!({ "title": "R", "invented_later": true });

        let release: Release = serde_json::from_value(json).unwrap();

        assert_eq!(release.title, "R");
        assert_eq!(release.guid, "");
        assert_eq!(release.seeders, None);
    }

    #[test]
    fn caps_answer_the_keys_that_pick_a_query_strategy() {
        let json = serde_json::to_value(Caps {
            search_tmdb: true,
            tv_search_season: true,
            server_title: Some("Jackett".into()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(json["search_tmdb"], true);
        assert_eq!(json["tv_search_season"], true);
        assert_eq!(json["server_title"], "Jackett");
    }
}
