//! The provider side of the three indexer ports: the routes the indexer module
//! mounts and the handlers behind them.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::HostCtx;
use serde::{Deserialize, Serialize};

use crate::ports::Query;

use super::{
    DownloadTarget, IndexerDbPort, IndexerRow, IndexerSearchPort, SearchOutcome, TorrentFetchPort,
};

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
pub(super) struct FetchResp {
    pub(super) found: bool,
    pub(super) error: Option<String>,
    pub(super) data: Option<Vec<u8>>,
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

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::fixtures::{sample_row, ErrDb, FetchMode, OkDb, OkSearch};

    use kroma_module_host::testing::StubHost;

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
    async fn every_ledger_verb_maps_its_error_into_the_envelope() {
        let db: Arc<dyn IndexerDbPort> = Arc::new(ErrDb);
        let Json(res) = enabled_h::<StubHost>(State(StubHost::new()), Extension(db.clone())).await;
        assert_eq!(res.unwrap_err(), "boom");

        let Json(res) =
            get_h::<StubHost>(State(StubHost::new()), Extension(db.clone()), Json(IdReq { id: "a".into() }))
                .await;
        assert_eq!(res.unwrap_err(), "boom");

        let req = NoteReq { id: "a".into(), ok: true, error: None, now_ms: 1 };
        let Json(res) = note_h::<StubHost>(State(StubHost::new()), Extension(db), Json(req)).await;
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
}
