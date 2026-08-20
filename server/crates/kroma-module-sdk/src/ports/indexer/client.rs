//! The consumer side of the three indexer ports: clients that reach whichever
//! module currently serves them.

use kroma_module_host::{call, call_raw, HostCtx, Resolver};
use serde_json::json;

use crate::ports::Query;

use super::routes::FetchResp;
use super::{
    DownloadTarget, IndexerDbPort, IndexerRow, IndexerSearchPort, SearchOutcome, TorrentFetchPort,
};

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
    use std::sync::Arc;

    use super::*;

    use super::super::fixtures::{sample_row, ErrDb, FetchMode, OkDb, OkSearch};
    use super::super::indexer_routes;

    use crate::testing::{blocking, serve};

    use kroma_module_host::testing::StubHost;

    fn offline() -> Resolver {
        Arc::new(|| None)
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
