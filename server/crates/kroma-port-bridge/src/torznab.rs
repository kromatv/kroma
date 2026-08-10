//! The `TorznabPort` bridge: stateless, no `HostCtx`.

use std::sync::Arc;

use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_sdk::ports::{Caps, IndexerEndpoint, Query, Release, TorznabPort};

use crate::{call, Resolver};

/// Routes a provider mounts to expose its `TorznabPort` over HTTP. Merge into the
/// module process's router (see `kroma_module_runtime::serve`'s `extra`).
pub fn torznab_routes<S: Clone + Send + Sync + 'static>(engine: Arc<dyn TorznabPort>) -> Router<S> {
    Router::new()
        .route("/_port/torznab/caps", post(caps_h))
        .route("/_port/torznab/search", post(search_h))
        .layer(Extension(engine))
}

async fn run<T>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Json<Result<T, String>>
where
    T: Send + 'static,
{
    let out = tokio::task::spawn_blocking(job)
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r.map_err(|e| format!("{e:#}")));
    Json(out)
}

async fn caps_h(
    Extension(engine): Extension<Arc<dyn TorznabPort>>,
    Json(endpoint): Json<IndexerEndpoint>,
) -> Json<Result<Caps, String>> {
    run(move || engine.caps(&endpoint)).await
}

#[derive(serde::Deserialize)]
struct SearchReq {
    endpoint: IndexerEndpoint,
    query: Query,
    caps: Caps,
}

async fn search_h(
    Extension(engine): Extension<Arc<dyn TorznabPort>>,
    Json(req): Json<SearchReq>,
) -> Json<Result<Vec<Release>, String>> {
    run(move || engine.search(&req.endpoint, &req.query, &req.caps)).await
}

/// A `TorznabPort` that forwards to the torznab module process over localhost.
pub struct TorznabClient {
    resolve: Resolver,
}

impl TorznabClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}

impl TorznabPort for TorznabClient {
    fn caps(&self, endpoint: &IndexerEndpoint) -> anyhow::Result<Caps> {
        call(&self.resolve, "torznab/caps", endpoint)
    }

    fn search(&self, endpoint: &IndexerEndpoint, query: &Query, caps: &Caps) -> anyhow::Result<Vec<Release>> {
        call(
            &self.resolve,
            "torznab/search",
            &serde_json::json!({ "endpoint": endpoint, "query": query, "caps": caps }),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::testing::{blocking, serve};

    struct StubTz {
        fail: bool,
    }

    impl StubTz {
        fn working() -> Self {
            Self { fail: false }
        }
        fn failing() -> Self {
            Self { fail: true }
        }
    }

    impl TorznabPort for StubTz {
        fn caps(&self, _endpoint: &IndexerEndpoint) -> anyhow::Result<Caps> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(Caps { search_tmdb: true, ..Default::default() })
        }
        fn search(
            &self,
            _endpoint: &IndexerEndpoint,
            _query: &Query,
            _caps: &Caps,
        ) -> anyhow::Result<Vec<Release>> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(vec![Release { title: "R".into(), guid: "g".into(), ..Default::default() }])
        }
    }

    fn endpoint() -> IndexerEndpoint {
        IndexerEndpoint { url: "http://jackett".into(), api_key: "k".into(), categories: vec![2000] }
    }

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    #[tokio::test]
    async fn caps_handler_ok_and_err() {
        let ok: Arc<dyn TorznabPort> = Arc::new(StubTz::working());
        let Json(res) = caps_h(Extension(ok), Json(endpoint())).await;
        assert!(res.unwrap().search_tmdb);

        let err: Arc<dyn TorznabPort> = Arc::new(StubTz::failing());
        let Json(res) = caps_h(Extension(err), Json(endpoint())).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn search_handler_returns_releases() {
        let engine: Arc<dyn TorznabPort> = Arc::new(StubTz::working());
        let req = SearchReq {
            endpoint: endpoint(),
            query: Query::Episode { tmdb_id: Some(1), title: "T".into(), season: 1, episode: 2 },
            caps: Caps::default(),
        };
        let Json(res) = search_h(Extension(engine), Json(req)).await;
        let releases = res.unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].guid, "g");
    }

    #[tokio::test]
    async fn search_handler_maps_error() {
        let engine: Arc<dyn TorznabPort> = Arc::new(StubTz::failing());
        let req = SearchReq {
            endpoint: endpoint(),
            query: Query::Season { tmdb_id: None, title: "T".into(), season: 3 },
            caps: Caps::default(),
        };
        let Json(res) = search_h(Extension(engine), Json(req)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[test]
    fn client_offline_errors() {
        let c = TorznabClient::new(offline());
        assert!(c.caps(&endpoint()).is_err());
        assert!(c
            .search(&endpoint(), &Query::Movie { tmdb_id: None, imdb_id: None, title: "T".into(), year: None }, &Caps::default())
            .is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn caps_and_releases_survive_the_round_trip() {
        let engine: Arc<dyn TorznabPort> = Arc::new(StubTz::working());
        let resolve = serve(torznab_routes::<()>(engine), ()).await;

        let client = TorznabClient::new(resolve.clone());
        let caps = blocking(move || client.caps(&endpoint())).await.unwrap();
        assert!(caps.search_tmdb);

        let client = TorznabClient::new(resolve);
        let releases = blocking(move || {
            let query = Query::Movie {
                tmdb_id: Some(603),
                imdb_id: None,
                title: "The Matrix".into(),
                year: Some(1999),
            };
            client.search(&endpoint(), &query, &Caps { search_tmdb: true, ..Default::default() })
        })
        .await
        .unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].title, "R");
        assert_eq!(releases[0].guid, "g");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_indexer_failure_crosses_the_wire_as_an_error() {
        let engine: Arc<dyn TorznabPort> = Arc::new(StubTz::failing());
        let resolve = serve(torznab_routes::<()>(engine), ()).await;

        let client = TorznabClient::new(resolve);
        let err = blocking(move || client.caps(&endpoint())).await.unwrap_err().to_string();
        assert!(err.contains("boom"), "{err}");
    }
}
