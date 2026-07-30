//! Bridges for the indexer's provider ports: `IndexerDbPort`, `IndexerSearchPort`
//! and `TorrentFetchPort` (consumed by torrents + acquisition). All take a
//! `&dyn HostCtx`, re-supplied locally on the provider side; the boundary types
//! derive serde.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::HostCtx;
use kroma_module_sdk::ports::{
    DownloadTarget, IndexerDbPort, IndexerRow, IndexerSearchPort, Query, SearchOutcome,
    TorrentFetchPort,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{call, call_raw, Resolver};

/// Routes the indexer sidecar mounts for its three provider ports.
pub fn indexer_routes<S: HostCtx + Clone + Send + Sync + 'static>(
    db: Arc<dyn IndexerDbPort>,
    search: Arc<dyn IndexerSearchPort>,
    fetch: Arc<dyn TorrentFetchPort>,
) -> Router<S> {
    Router::new()
        .route("/_port/indexerdb/list", post(list_h::<S>))
        .route("/_port/indexerdb/enabled", post(enabled_h::<S>))
        .route("/_port/indexerdb/get", post(get_h::<S>))
        .route("/_port/indexerdb/note", post(note_h::<S>))
        .route("/_port/indexersearch/search", post(search_h::<S>))
        .route("/_port/indexersearch/resolve", post(resolve_h::<S>))
        .route("/_port/torrentfetch/fetch", post(fetch_h::<S>))
        .layer(Extension(db))
        .layer(Extension(search))
        .layer(Extension(fetch))
}

async fn blocking_env<T: Send + 'static>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Json<Result<T, String>> {
    Json(
        tokio::task::spawn_blocking(job)
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r.map_err(|e| format!("{e:#}"))),
    )
}

async fn list_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn IndexerDbPort>>,
) -> Json<Result<Vec<IndexerRow>, String>> {
    blocking_env(move || db.list_indexers(&host)).await
}

async fn enabled_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn IndexerDbPort>>,
) -> Json<Result<Vec<IndexerRow>, String>> {
    blocking_env(move || db.enabled_indexers(&host)).await
}

#[derive(Deserialize)]
struct IdReq {
    id: String,
}

async fn get_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn IndexerDbPort>>,
    Json(req): Json<IdReq>,
) -> Json<Result<Option<IndexerRow>, String>> {
    blocking_env(move || db.get_indexer(&host, &req.id)).await
}

#[derive(Deserialize)]
struct NoteReq {
    id: String,
    ok: bool,
    error: Option<String>,
    now_ms: i64,
}

async fn note_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(db): Extension<Arc<dyn IndexerDbPort>>,
    Json(req): Json<NoteReq>,
) -> Json<Result<(), String>> {
    blocking_env(move || db.note_indexer_result(&host, &req.id, req.ok, req.error.as_deref(), req.now_ms))
        .await
}

#[derive(Deserialize)]
struct SearchReq {
    row: IndexerRow,
    query: Query,
    categories: Vec<u32>,
}

async fn search_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(search): Extension<Arc<dyn IndexerSearchPort>>,
    Json(req): Json<SearchReq>,
) -> Json<Result<SearchOutcome, String>> {
    blocking_env(move || search.search(&host, &req.row, &req.query, &req.categories)).await
}

#[derive(Deserialize)]
struct ResolveReq {
    row: IndexerRow,
    title: String,
    details_url: Option<String>,
    magnet_or_url: String,
}

async fn resolve_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(search): Extension<Arc<dyn IndexerSearchPort>>,
    Json(req): Json<ResolveReq>,
) -> Json<Result<DownloadTarget, String>> {
    blocking_env(move || {
        search.resolve_download(&host, &req.row, &req.title, req.details_url.as_deref(), &req.magnet_or_url)
    })
    .await
}

// The tri-state Option<Result<..>> crosses the wire as this struct: `found`
// false means "not this port's indexer" (the caller does a plain fetch).
#[derive(Serialize, Deserialize, Default)]
struct FetchResp {
    found: bool,
    error: Option<String>,
    data: Option<Vec<u8>>,
}

#[derive(Deserialize)]
struct FetchReq {
    indexer_id: String,
    url: String,
}

async fn fetch_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Extension(fetch): Extension<Arc<dyn TorrentFetchPort>>,
    Json(req): Json<FetchReq>,
) -> Json<FetchResp> {
    let resp = tokio::task::spawn_blocking(move || fetch.fetch_torrent(&host, &req.indexer_id, &req.url))
        .await
        .ok()
        .flatten();
    Json(match resp {
        None => FetchResp::default(),
        Some(Ok(data)) => FetchResp { found: true, error: None, data: Some(data) },
        Some(Err(e)) => FetchResp { found: true, error: Some(format!("{e:#}")), data: None },
    })
}

pub struct IndexerDbClient {
    resolve: Resolver,
}
pub struct IndexerSearchClient {
    resolve: Resolver,
}
pub struct TorrentFetchClient {
    resolve: Resolver,
}

impl IndexerDbClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}
impl IndexerSearchClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}
impl TorrentFetchClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}

impl IndexerDbPort for IndexerDbClient {
    fn list_indexers(&self, _host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
        call(&self.resolve, "indexerdb/list", &json!({}))
    }
    fn enabled_indexers(&self, _host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRow>> {
        call(&self.resolve, "indexerdb/enabled", &json!({}))
    }
    fn get_indexer(&self, _host: &dyn HostCtx, id: &str) -> anyhow::Result<Option<IndexerRow>> {
        call(&self.resolve, "indexerdb/get", &json!({ "id": id }))
    }
    fn note_indexer_result(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        ok: bool,
        error: Option<&str>,
        now_ms: i64,
    ) -> anyhow::Result<()> {
        call(
            &self.resolve,
            "indexerdb/note",
            &json!({ "id": id, "ok": ok, "error": error, "now_ms": now_ms }),
        )
    }
}

impl IndexerSearchPort for IndexerSearchClient {
    fn search(
        &self,
        _host: &dyn HostCtx,
        row: &IndexerRow,
        query: &Query,
        categories: &[u32],
    ) -> anyhow::Result<SearchOutcome> {
        call(
            &self.resolve,
            "indexersearch/search",
            &json!({ "row": row, "query": query, "categories": categories }),
        )
    }
    fn resolve_download(
        &self,
        _host: &dyn HostCtx,
        row: &IndexerRow,
        title: &str,
        details_url: Option<&str>,
        magnet_or_url: &str,
    ) -> anyhow::Result<DownloadTarget> {
        call(
            &self.resolve,
            "indexersearch/resolve",
            &json!({ "row": row, "title": title, "details_url": details_url, "magnet_or_url": magnet_or_url }),
        )
    }
}

impl TorrentFetchPort for TorrentFetchClient {
    fn fetch_torrent(
        &self,
        _host: &dyn HostCtx,
        indexer_id: &str,
        url: &str,
    ) -> Option<anyhow::Result<Vec<u8>>> {
        let resp: FetchResp = call_raw(
            &self.resolve,
            "torrentfetch/fetch",
            &json!({ "indexer_id": indexer_id, "url": url }),
        )
        .ok()?;
        if !resp.found {
            return None;
        }
        match resp.error {
            Some(e) => Some(Err(anyhow::anyhow!(e))),
            None => Some(Ok(resp.data.unwrap_or_default())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_host::testing::StubHost;

    fn sample_row(id: &str) -> IndexerRow {
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

    struct OkDb;
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

    struct ErrDb;
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

    struct OkSearch;
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

    struct FetchMode(Option<Result<Vec<u8>, ()>>);
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

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    #[tokio::test]
    async fn list_handler_returns_rows() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(OkDb);
        let Json(res) = list_h::<StubHost>(State(StubHost::new()), Extension(db)).await;
        assert_eq!(res.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn list_handler_maps_error_into_envelope() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(ErrDb);
        let Json(res) = list_h::<StubHost>(State(StubHost::new()), Extension(db)).await;
        assert_eq!(res.unwrap_err(), "boom");
    }

    #[tokio::test]
    async fn enabled_handler_returns_rows() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(OkDb);
        let Json(res) = enabled_h::<StubHost>(State(StubHost::new()), Extension(db)).await;
        assert_eq!(res.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn get_handler_hit_and_miss() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(OkDb);
        let Json(hit) =
            get_h::<StubHost>(State(StubHost::new()), Extension(db.clone()), Json(IdReq { id: "a".into() }))
                .await;
        assert_eq!(hit.unwrap().unwrap().id, "a");

        let Json(miss) =
            get_h::<StubHost>(State(StubHost::new()), Extension(db), Json(IdReq { id: "z".into() })).await;
        assert!(miss.unwrap().is_none());
    }

    #[tokio::test]
    async fn note_handler_acks() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(OkDb);
        let req = NoteReq { id: "a".into(), ok: false, error: Some("nope".into()), now_ms: 5 };
        let Json(res) = note_h::<StubHost>(State(StubHost::new()), Extension(db), Json(req)).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn search_handler_returns_outcome() {
        let search: Arc<dyn IndexerSearchPort> = Arc::new(OkSearch);
        let req = SearchReq {
            row: sample_row("a"),
            query: Query::Movie { tmdb_id: Some(1), imdb_id: None, title: "T".into(), year: Some(2020) },
            categories: vec![2000],
        };
        let Json(res) = search_h::<StubHost>(State(StubHost::new()), Extension(search), Json(req)).await;
        assert_eq!(res.unwrap().errors, vec!["partial".to_string()]);
    }

    #[tokio::test]
    async fn resolve_handler_returns_magnet() {
        let search: Arc<dyn IndexerSearchPort> = Arc::new(OkSearch);
        let req = ResolveReq {
            row: sample_row("a"),
            title: "T".into(),
            details_url: None,
            magnet_or_url: "magnet:?xt=1".into(),
        };
        let Json(res) = resolve_h::<StubHost>(State(StubHost::new()), Extension(search), Json(req)).await;
        match res.unwrap() {
            DownloadTarget::Magnet(m) => assert_eq!(m, "magnet:?xt=1"),
            other => panic!("expected magnet, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn fetch_handler_tri_state() {
        let req = || FetchReq { indexer_id: "id".into(), url: "http://x".into() };

        let none: Arc<dyn TorrentFetchPort> = Arc::new(FetchMode(None));
        let Json(resp) = fetch_h::<StubHost>(State(StubHost::new()), Extension(none), Json(req())).await;
        assert!(!resp.found && resp.data.is_none() && resp.error.is_none());

        let ok: Arc<dyn TorrentFetchPort> = Arc::new(FetchMode(Some(Ok(vec![1, 2, 3]))));
        let Json(resp) = fetch_h::<StubHost>(State(StubHost::new()), Extension(ok), Json(req())).await;
        assert!(resp.found);
        assert_eq!(resp.data, Some(vec![1, 2, 3]));
        assert!(resp.error.is_none());

        let err: Arc<dyn TorrentFetchPort> = Arc::new(FetchMode(Some(Err(()))));
        let Json(resp) = fetch_h::<StubHost>(State(StubHost::new()), Extension(err), Json(req())).await;
        assert!(resp.found && resp.data.is_none());
        assert_eq!(resp.error.as_deref(), Some("fetch failed"));
    }

    #[test]
    fn wire_requests_deserialize() {
        let n: NoteReq = serde_json::from_value(
            serde_json::json!({ "id": "a", "ok": true, "error": null, "now_ms": 9 }),
        )
        .unwrap();
        assert_eq!(n.id, "a");
        assert!(n.ok && n.error.is_none() && n.now_ms == 9);

        let f: FetchReq =
            serde_json::from_value(serde_json::json!({ "indexer_id": "i", "url": "u" })).unwrap();
        assert_eq!(f.indexer_id, "i");
        assert_eq!(f.url, "u");

        // FetchResp default is the "not found" sentinel.
        let d = FetchResp::default();
        assert!(!d.found && d.data.is_none() && d.error.is_none());
    }

    #[test]
    fn db_client_surfaces_offline_error() {
        let c = IndexerDbClient::new(offline());
        assert!(c.list_indexers(&StubHost::new()).is_err());
        assert!(c.enabled_indexers(&StubHost::new()).is_err());
        assert!(c.get_indexer(&StubHost::new(), "a").is_err());
        assert!(c.note_indexer_result(&StubHost::new(), "a", true, None, 0).is_err());
    }

    #[test]
    fn search_client_surfaces_offline_error() {
        let c = IndexerSearchClient::new(offline());
        let q = Query::Season { tmdb_id: None, title: "T".into(), season: 1 };
        assert!(c.search(&StubHost::new(), &sample_row("a"), &q, &[2000]).is_err());
        assert!(c.resolve_download(&StubHost::new(), &sample_row("a"), "t", None, "mag").is_err());
    }

    #[test]
    fn fetch_client_returns_none_when_offline() {
        let c = TorrentFetchClient::new(offline());
        assert!(c.fetch_torrent(&StubHost::new(), "id", "http://x").is_none());
    }

    // Mounts the REAL router and points REAL clients at it, so the wire is
    // under test: paths, the `Result<T, String>` envelope, and the JSON
    // shape of every boundary type. Those only disagree at runtime, in a
    // sidecar.

    async fn serve<S: HostCtx + Clone + Send + Sync + 'static>(
        router: Router<S>,
        state: S,
    ) -> Resolver {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router.with_state(state);
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let base = format!("http://{addr}");
        Arc::new(move || Some((base.clone(), "test-token".to_string())))
    }

    async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
        tokio::task::spawn_blocking(job).await.unwrap()
    }

    async fn live(fetch: FetchMode) -> Resolver {
        let db: Arc<dyn IndexerDbPort> = Arc::new(OkDb);
        let search: Arc<dyn IndexerSearchPort> = Arc::new(OkSearch);
        let fetch: Arc<dyn TorrentFetchPort> = Arc::new(fetch);
        serve(indexer_routes::<StubHost>(db, search, fetch), StubHost::new()).await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_indexer_ledger_survives_the_round_trip() {
        let resolve = live(FetchMode(None)).await;

        let c = IndexerDbClient::new(resolve.clone());
        let all = blocking(move || c.list_indexers(&StubHost::new())).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "a");

        let c = IndexerDbClient::new(resolve.clone());
        assert_eq!(blocking(move || c.enabled_indexers(&StubHost::new())).await.unwrap().len(), 1);

        // A hit and a miss are different answers, and `None` must not arrive as
        // an error - an unknown indexer id is a normal lookup result.
        let c = IndexerDbClient::new(resolve.clone());
        assert!(blocking(move || c.get_indexer(&StubHost::new(), "a")).await.unwrap().is_some());
        let c = IndexerDbClient::new(resolve.clone());
        assert!(blocking(move || c.get_indexer(&StubHost::new(), "ghost")).await.unwrap().is_none());

        let c = IndexerDbClient::new(resolve);
        blocking(move || c.note_indexer_result(&StubHost::new(), "a", false, Some("timeout"), 1))
            .await
            .unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_search_carries_its_partial_errors_across() {
        // A search that half-worked returns releases AND the indexers that
        // failed. Dropping the errors on the wire would hide a broken tracker.
        let resolve = live(FetchMode(None)).await;
        let c = IndexerSearchClient::new(resolve);
        let outcome = blocking(move || {
            let row = sample_row("a");
            let q = Query::Movie {
                tmdb_id: Some(603),
                imdb_id: None,
                title: "The Matrix".into(),
                year: Some(1999),
            };
            c.search(&StubHost::new(), &row, &q, &[2000])
        })
        .await
        .unwrap();
        assert!(outcome.releases.is_empty());
        assert_eq!(outcome.errors, ["partial"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_resolved_download_target_keeps_its_variant() {
        // DownloadTarget is an enum on the wire; collapsing Magnet and
        // TorrentUrl would hand the engine the wrong kind of link.
        let resolve = live(FetchMode(None)).await;
        let c = IndexerSearchClient::new(resolve);
        let target = blocking(move || {
            let row = sample_row("a");
            c.resolve_download(&StubHost::new(), &row, "Some.Release", None, "magnet:?xt=urn:btih:AB")
        })
        .await
        .unwrap();
        assert!(matches!(target, DownloadTarget::Magnet(m) if m == "magnet:?xt=urn:btih:AB"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_three_torrent_fetch_answers_stay_distinct_across_the_wire() {
        // None ("not mine, use a plain fetch"), Some(Ok(bytes)) and Some(Err)
        // mean three different things to the caller. Flattening any pair of them
        // silently changes what happens to a download.
        let resolve = live(FetchMode(Some(Ok(vec![1, 2, 3])))).await;
        let c = TorrentFetchClient::new(resolve);
        let got = blocking(move || c.fetch_torrent(&StubHost::new(), "a", "http://x/f.torrent")).await;
        assert_eq!(got.unwrap().unwrap(), vec![1, 2, 3]);

        let resolve = live(FetchMode(None)).await;
        let c = TorrentFetchClient::new(resolve);
        assert!(blocking(move || c.fetch_torrent(&StubHost::new(), "a", "http://x/f.torrent"))
            .await
            .is_none());

        let resolve = live(FetchMode(Some(Err(())))).await;
        let c = TorrentFetchClient::new(resolve);
        let got = blocking(move || c.fetch_torrent(&StubHost::new(), "a", "http://x/f.torrent")).await;
        assert!(got.unwrap().is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_the_wire_as_an_error() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(ErrDb);
        let search: Arc<dyn IndexerSearchPort> = Arc::new(OkSearch);
        let fetch: Arc<dyn TorrentFetchPort> = Arc::new(FetchMode(None));
        let resolve = serve(indexer_routes::<StubHost>(db, search, fetch), StubHost::new()).await;

        let c = IndexerDbClient::new(resolve);
        let err = blocking(move || c.list_indexers(&StubHost::new())).await.unwrap_err().to_string();
        assert!(err.contains("boom"), "the provider's reason was lost: {err}");
    }
}
