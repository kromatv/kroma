//! The `indexer-db` and `indexer-search` points this module calls: which
//! indexers to sweep, the search itself, and resolving a chosen release's link.
//!
//! An indexer is named by ID. Its base URL, API key and settings JSON belong to
//! the module that keeps them and never reach this one, which is why
//! [`IndexerRef`] is four fields rather than thirteen.

use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{call, pinned_resolver, HostCtx, Resolver};


/// A release as an indexer reports it. Tolerant: the provider is separately
/// released, so a field it adds is ignored here and one it stops sending
/// defaults rather than dropping the whole sweep.
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

/// The configured indexers and their per-sweep result.
pub const INDEXER_DB: &str = "tv.kroma.indexer/db";

/// Running a search, and resolving a release's download link.
pub const INDEXER_SEARCH: &str = "tv.kroma.indexer/search";

/// The `kind` of a Cardigann-definition indexer. A grab from one needs the
/// provider's authenticated fetch rather than a plain HTTP GET.
pub const KIND_BUILTIN: &str = "builtin";

/// An indexer, as much of one as a sweep needs: what to call it in a report, and
/// what order to prefer it in.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct IndexerRef {
    pub id: String,
    pub name: String,
    pub kind: String,
    /// Higher wins when two indexers offer the same release.
    pub priority: i32,
    pub enabled: bool,
}

/// One search request. Externally tagged, so the variant name is part of the wire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Query {
    Movie { tmdb_id: Option<u64>, imdb_id: Option<String>, title: String, year: Option<u32> },
    Episode { tmdb_id: Option<u64>, title: String, season: u32, episode: u32 },
    Season { tmdb_id: Option<u64>, title: String, season: u32 },
}

/// One indexer's answer. A per-indexer error alongside real results is not fatal:
/// the sweep reports it and keeps what the others returned.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct SearchOutcome {
    pub releases: Vec<Release>,
    pub errors: Vec<String>,
}

/// Where a release's bytes come from.
#[derive(Debug, Clone, Deserialize)]
pub enum DownloadTarget {
    Magnet(String),
    TorrentUrl(String),
}

impl DownloadTarget {
    /// The link either variant carries, which is all a grab needs.
    pub fn link(self) -> String {
        match self {
            DownloadTarget::Magnet(m) => m,
            DownloadTarget::TorrentUrl(u) => u,
        }
    }
}

/// Every configured indexer, enabled or not.
pub fn list(host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRef>> {
    call(&db(host)?, &format!("{INDEXER_DB}/list"), &serde_json::json!({}))
}

/// The indexers a sweep should ask.
pub fn enabled(host: &dyn HostCtx) -> anyhow::Result<Vec<IndexerRef>> {
    call(&db(host)?, &format!("{INDEXER_DB}/enabled"), &serde_json::json!({}))
}

/// One indexer, or `None` when nothing has that id (a row can outlive a release
/// that names it).
pub fn get(host: &dyn HostCtx, id: &str) -> anyhow::Result<Option<IndexerRef>> {
    call(&db(host)?, &format!("{INDEXER_DB}/get"), &serde_json::json!({ "id": id }))
}

/// Record how an indexer answered, so the admin sees which one stopped working.
pub fn note_result(
    host: &dyn HostCtx,
    id: &str,
    ok: bool,
    error: Option<&str>,
    now_ms: i64,
) -> anyhow::Result<()> {
    call(
        &db(host)?,
        &format!("{INDEXER_DB}/note-result"),
        &serde_json::json!({ "id": id, "ok": ok, "error": error, "now_ms": now_ms }),
    )
}

/// Search one indexer. Its own configured categories are used, which is what the
/// caller wants in every case here.
pub fn search(host: &dyn HostCtx, indexer_id: &str, query: &Query) -> anyhow::Result<SearchOutcome> {
    call(
        &search_at(host)?,
        &format!("{INDEXER_SEARCH}/search"),
        &serde_json::json!({ "indexer_id": indexer_id, "query": query }),
    )
}

/// Turn a chosen release into the link to hand a download engine.
pub fn resolve_download(
    host: &dyn HostCtx,
    indexer_id: &str,
    title: &str,
    details_url: Option<&str>,
    magnet_or_url: &str,
) -> anyhow::Result<DownloadTarget> {
    call(
        &search_at(host)?,
        &format!("{INDEXER_SEARCH}/resolve-download"),
        &serde_json::json!({
            "indexer_id": indexer_id,
            "title": title,
            "details_url": details_url,
            "magnet_or_url": magnet_or_url,
        }),
    )
}

fn db(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, INDEXER_DB)
}

fn search_at(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, INDEXER_SEARCH)
}

fn resolve(host: &dyn HostCtx, point: &str) -> anyhow::Result<Resolver> {
    pinned_resolver(host, point, None)
        .ok_or_else(|| anyhow::anyhow!("no module answers the {point} point"))
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_query_crosses_under_the_variant_name_the_provider_reads() {
        let json = serde_json::to_value(Query::Episode {
            tmdb_id: Some(1),
            title: "Severance".into(),
            season: 2,
            episode: 7,
        })
        .unwrap();

        assert_eq!(json["Episode"]["season"], 2);
        assert_eq!(json["Episode"]["episode"], 7);
        assert_eq!(json["Episode"]["title"], "Severance");
    }

    // The provider sends only what a sweep needs, and may add a field later.
    #[test]
    fn a_ref_deserializes_from_the_four_fields_a_sweep_orders_on() {
        let json = serde_json::json!({
            "id": "idx-1",
            "name": "Jackett",
            "kind": "torznab",
            "priority": 30,
            "enabled": true,
            "invented_later": 1,
        });

        let indexer: IndexerRef = serde_json::from_value(json).unwrap();

        assert_eq!(indexer.id, "idx-1");
        assert_eq!(indexer.priority, 30);
        assert!(indexer.enabled);
    }

    #[test]
    fn an_outcome_with_errors_and_results_keeps_both() {
        let json = serde_json::json!({
            "releases": [{ "title": "R", "guid": "g" }],
            "errors": ["one indexer timed out"],
        });

        let outcome: SearchOutcome = serde_json::from_value(json).unwrap();

        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.errors, vec!["one indexer timed out".to_string()]);
    }

    #[test]
    fn either_target_yields_the_link_a_grab_needs() {
        let magnet: DownloadTarget =
            serde_json::from_value(serde_json::json!({ "Magnet": "magnet:?xt=1" })).unwrap();
        assert_eq!(magnet.link(), "magnet:?xt=1");

        let url: DownloadTarget =
            serde_json::from_value(serde_json::json!({ "TorrentUrl": "http://t/f.torrent" }))
                .unwrap();
        assert_eq!(url.link(), "http://t/f.torrent");
    }

    fn fake_indexer() -> axum::Router<()> {
        use axum::routing::post;
        use axum::Json;
        use serde_json::Value;

        async fn list(Json(_): Json<Value>) -> Json<Result<Vec<Value>, String>> {
            Json(Ok(vec![
                serde_json::json!({ "id": "a", "name": "A", "kind": "torznab", "priority": 30, "enabled": true }),
                serde_json::json!({ "id": "b", "name": "B", "kind": "builtin", "priority": 10, "enabled": true }),
            ]))
        }

        async fn get(Json(req): Json<Value>) -> Json<Result<Option<Value>, String>> {
            if req["id"] != "a" {
                return Json(Ok(None));
            }
            Json(Ok(Some(serde_json::json!({
                "id": "a", "name": "A", "kind": "builtin", "priority": 30, "enabled": true
            }))))
        }

        async fn note(Json(req): Json<Value>) -> Json<Result<(), String>> {
            assert_eq!(req["now_ms"], 42);
            Json(Ok(()))
        }

        async fn search(Json(req): Json<Value>) -> Json<Result<Value, String>> {
            // The consumer names the indexer by id; the row never crosses.
            assert_eq!(req["indexer_id"], "a");
            assert!(req["query"]["Episode"].is_object(), "{:?}", req["query"]);
            Json(Ok(serde_json::json!({
                "releases": [{ "title": "R", "guid": "g", "seeders": 9 }],
                "errors": ["one indexer timed out"],
            })))
        }

        async fn resolve(Json(req): Json<Value>) -> Json<Result<Value, String>> {
            Json(Ok(serde_json::json!({ "TorrentUrl": req["magnet_or_url"] })))
        }

        axum::Router::new()
            .route("/_port/tv.kroma.indexer/db/list", post(list))
            .route("/_port/tv.kroma.indexer/db/enabled", post(list))
            .route("/_port/tv.kroma.indexer/db/get", post(get))
            .route("/_port/tv.kroma.indexer/db/note-result", post(note))
            .route("/_port/tv.kroma.indexer/search/search", post(search))
            .route("/_port/tv.kroma.indexer/search/resolve-download", post(resolve))
    }

    async fn indexer_host() -> StubHost {
        let resolve = kroma_module_host::test_serve::serve(fake_indexer(), ()).await;
        let (base, token) = resolve().expect("the fake indexer is up");
        StubHost::new()
            .with_point(INDEXER_DB, None, &base, &token)
            .with_point(INDEXER_SEARCH, None, &base, &token)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_sweep_gets_the_indexers_it_orders_on() {
        let host = indexer_host().await;

        let (all, live) = kroma_module_host::test_serve::blocking(move || {
            (list(&host).unwrap(), enabled(&host).unwrap())
        })
        .await;

        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "a");
        assert_eq!(all[0].priority, 30);
        assert_eq!(live[1].kind, KIND_BUILTIN);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn one_indexer_by_id_or_none_when_it_is_gone() {
        let host = indexer_host().await;

        let (found, missing) = kroma_module_host::test_serve::blocking(move || {
            (get(&host, "a").unwrap(), get(&host, "ghost").unwrap())
        })
        .await;

        assert_eq!(found.unwrap().kind, KIND_BUILTIN);
        assert!(missing.is_none());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_search_names_the_indexer_by_id_and_keeps_both_halves_of_the_answer() {
        let host = indexer_host().await;

        let outcome = kroma_module_host::test_serve::blocking(move || {
            search(
                &host,
                "a",
                &Query::Episode {
                    tmdb_id: Some(1),
                    title: "Severance".into(),
                    season: 2,
                    episode: 7,
                },
            )
        })
        .await
        .unwrap();

        assert_eq!(outcome.releases.len(), 1);
        assert_eq!(outcome.releases[0].seeders, Some(9));
        assert_eq!(outcome.errors, vec!["one indexer timed out".to_string()]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_resolved_download_yields_the_link_and_a_note_lands() {
        let host = indexer_host().await;

        let link = kroma_module_host::test_serve::blocking(move || {
            note_result(&host, "a", false, Some("timeout"), 42).unwrap();
            resolve_download(&host, "a", "R", None, "http://t/f.torrent").unwrap().link()
        })
        .await;

        assert_eq!(link, "http://t/f.torrent");
    }

    #[test]
    fn no_indexer_module_is_an_error_the_search_surfaces() {
        let host = StubHost::new();

        assert!(enabled(&host).is_err());
        assert!(get(&host, "idx-1").is_err());
    }
}
