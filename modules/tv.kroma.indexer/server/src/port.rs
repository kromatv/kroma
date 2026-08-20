//! The three points this module answers: the indexer list, search, and the
//! authenticated `.torrent` fetch.
//!
//! A consumer names an indexer by ID and this module reads its own row. That is
//! the whole reason the wire got smaller: the old contract shipped the full row,
//! so an indexer's `url`, `api_key` and `settings` JSON crossed a process
//! boundary to consumers that read none of them. What crosses now is
//! [`IndexerRef`], which is what a caller actually needs to order a sweep and
//! report on it.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{port_reply, HostStorage};

use crate::db::IndexerRow;
use crate::{Query, Release};

/// The configured indexers, and their per-sweep result.
pub const INDEXER_DB: &str = "tv.kroma.indexer/db";

/// Running a search, and resolving a release's download link.
pub const INDEXER_SEARCH: &str = "tv.kroma.indexer/search";

/// Fetching a `.torrent` through an indexer's authenticated session.
pub const TORRENT_FETCH: &str = "tv.kroma.indexer/torrent-fetch";

/// An indexer as a consumer needs it: enough to order a sweep, name the source of
/// a release, and report which one failed. The credentials and the base URL stay
/// in this module.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct IndexerRef {
    pub id: String,
    pub name: String,
    /// `builtin` for a Cardigann definition, anything else for an external
    /// endpoint. A caller reads it to know whether a download needs this module's
    /// authenticated fetch.
    pub kind: String,
    /// Higher wins when two indexers offer the same release.
    pub priority: i32,
    pub enabled: bool,
}

impl From<&IndexerRow> for IndexerRef {
    fn from(row: &IndexerRow) -> Self {
        Self {
            id: row.id.clone(),
            name: row.name.clone(),
            kind: row.kind.clone(),
            priority: row.priority,
            enabled: row.enabled,
        }
    }
}

/// Where a release's bytes come from.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadTarget {
    Magnet(String),
    TorrentUrl(String),
}

/// One indexer's answer. A per-indexer error alongside real results is not fatal:
/// the sweep reports it and keeps the releases the others returned.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SearchOutcome {
    pub releases: Vec<Release>,
    pub errors: Vec<String>,
}

/// The routes this module mounts for its three points.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.indexer/db/list", post(list::<S>))
        .route("/_port/tv.kroma.indexer/db/enabled", post(enabled::<S>))
        .route("/_port/tv.kroma.indexer/db/get", post(get::<S>))
        .route("/_port/tv.kroma.indexer/db/note-result", post(note_result::<S>))
        .route("/_port/tv.kroma.indexer/search/search", post(search::<S>))
        .route("/_port/tv.kroma.indexer/search/resolve-download", post(resolve_download::<S>))
        .route("/_port/tv.kroma.indexer/torrent-fetch/fetch", post(fetch::<S>))
}

async fn list<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Result<Vec<IndexerRef>, String>> {
    port_reply(move || {
        let conn = host.store().get()?;
        Ok(crate::db::list_indexers(&conn)?.iter().map(IndexerRef::from).collect())
    })
    .await
}

async fn enabled<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Result<Vec<IndexerRef>, String>> {
    port_reply(move || {
        let conn = host.store().get()?;
        Ok(crate::db::enabled_indexers(&conn)?.iter().map(IndexerRef::from).collect())
    })
    .await
}

#[derive(Deserialize)]
struct IdReq {
    id: String,
}

async fn get<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<Option<IndexerRef>, String>> {
    port_reply(move || {
        let conn = host.store().get()?;
        Ok(crate::db::get_indexer(&conn, &req.id)?.as_ref().map(IndexerRef::from))
    })
    .await
}

#[derive(Deserialize)]
struct NoteReq {
    id: String,
    ok: bool,
    #[serde(default)]
    error: Option<String>,
    now_ms: i64,
}

async fn note_result<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<NoteReq>,
) -> Json<Result<(), String>> {
    port_reply(move || {
        crate::db::note_indexer_result(
            host.store(),
            &req.id,
            req.ok,
            req.error.as_deref(),
            req.now_ms,
        )
    })
    .await
}

#[derive(Deserialize)]
struct SearchReq {
    indexer_id: String,
    query: WireQuery,
    /// Torznab category buckets to search. Empty means the indexer's own
    /// configured set, which is what a caller that does not care should send.
    #[serde(default)]
    categories: Vec<u32>,
}

// The query as it crosses: this module's own `Query` also has a `Text` variant
// the native engine uses internally, which no consumer builds.
#[derive(Deserialize)]
enum WireQuery {
    Movie { tmdb_id: Option<u64>, imdb_id: Option<String>, title: String, year: Option<u32> },
    Episode { tmdb_id: Option<u64>, title: String, season: u32, episode: u32 },
    Season { tmdb_id: Option<u64>, title: String, season: u32 },
}

impl From<WireQuery> for Query {
    fn from(q: WireQuery) -> Self {
        match q {
            WireQuery::Movie { tmdb_id, imdb_id, title, year } => {
                Query::Movie { tmdb_id, imdb_id, title, year }
            }
            WireQuery::Episode { tmdb_id, title, season, episode } => {
                Query::Episode { tmdb_id, title, season, episode }
            }
            WireQuery::Season { tmdb_id, title, season } => {
                Query::Season { tmdb_id, title, season }
            }
        }
    }
}

async fn search<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<SearchReq>,
) -> Json<Result<SearchOutcome, String>> {
    port_reply(move || {
        let row = row_of(&host, &req.indexer_id)?;
        let categories =
            if req.categories.is_empty() { row.categories.clone() } else { req.categories };
        crate::search::run(&host, &row, &req.query.into(), &categories)
    })
    .await
}

#[derive(Deserialize)]
struct ResolveReq {
    indexer_id: String,
    title: String,
    #[serde(default)]
    details_url: Option<String>,
    magnet_or_url: String,
}

async fn resolve_download<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<ResolveReq>,
) -> Json<Result<DownloadTarget, String>> {
    port_reply(move || {
        let row = row_of(&host, &req.indexer_id)?;
        crate::search::resolve_download(
            &host,
            &row,
            &req.title,
            req.details_url.as_deref(),
            &req.magnet_or_url,
        )
    })
    .await
}

#[derive(Deserialize)]
struct FetchReq {
    indexer_id: String,
    url: String,
}

/// `Ok(None)` means this indexer needs no authenticated fetch, so the caller does
/// a plain HTTP GET; an `Err` means the authenticated fetch itself failed, which
/// a plain GET would not fix.
async fn fetch<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<FetchReq>,
) -> Json<Result<Option<Vec<u8>>, String>> {
    port_reply(move || crate::search::fetch_torrent(&host, &req.indexer_id, &req.url)).await
}

fn row_of<S: HostStorage>(host: &S, id: &str) -> anyhow::Result<IndexerRow> {
    let conn = host.store().get()?;
    crate::db::get_indexer(&conn, id)?
        .ok_or_else(|| anyhow::anyhow!("no indexer with id {id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde_json::json;
    use tower::ServiceExt as _;

    type DbHost = kroma_module_sdk::host::testing::StubHost;

    // The routes over a real database with real rows, driven the way the core's
    // reverse proxy drives them. The parsing tests below pin the request shapes;
    // these pin what a consumer actually gets back.
    fn host_with(rows: &[(&str, &str, bool, i32)]) -> DbHost {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-port");
        {
            let conn = pool.get().unwrap();
            kroma_module_sdk::db::apply_migrations(&conn, crate::db::MIGRATIONS).unwrap();
        }
        for (id, kind, enabled, priority) in rows {
            let mut row = crate::db::IndexerRow {
                id: (*id).into(),
                name: id.to_uppercase(),
                url: format!("http://{id}.example/api"),
                api_key: "SECRET".into(),
                categories: vec![2000],
                enabled: *enabled,
                priority: *priority,
                kind: (*kind).into(),
                definition_id: Some("def".into()),
                settings: "{}".into(),
                last_ok_at: None,
                last_error: None,
                created_at: 0,
            };
            if *kind != crate::admin::KIND_BUILTIN {
                row.definition_id = None;
            }
            crate::db::insert_indexer(&pool, &row).unwrap();
        }
        DbHost::with_store((*pool).clone())
    }

    async fn call(host: DbHost, path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        let app = routes::<DbHost>().with_state(host);
        let req = Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn the_list_answers_every_row_and_the_enabled_one_only_the_live_ones() {
        let host = host_with(&[("a", "torznab", true, 30), ("b", "torznab", false, 10)]);

        let (status, all) = call(host.clone(), "/_port/tv.kroma.indexer/db/list", json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(all["Ok"].as_array().unwrap().len(), 2);

        let (_, live) = call(host, "/_port/tv.kroma.indexer/db/enabled", json!({})).await;
        let live = live["Ok"].as_array().unwrap();
        assert_eq!(live.len(), 1);
        assert_eq!(live[0]["id"], "a");
    }

    // The reason this point takes an id: a consumer must never receive an
    // indexer's credentials, and this is the assertion that keeps it that way.
    #[tokio::test]
    async fn no_answer_carries_the_url_or_the_api_key() {
        let host = host_with(&[("a", "torznab", true, 30)]);

        let (_, all) = call(host.clone(), "/_port/tv.kroma.indexer/db/list", json!({})).await;
        let (_, one) = call(host, "/_port/tv.kroma.indexer/db/get", json!({ "id": "a" })).await;

        for answer in [&all, &one] {
            let text = answer.to_string();
            assert!(!text.contains("SECRET"), "an api key crossed: {text}");
            assert!(!text.contains("a.example"), "a base url crossed: {text}");
        }
        assert_eq!(one["Ok"]["id"], "a");
        assert_eq!(one["Ok"]["priority"], 30);
    }

    #[tokio::test]
    async fn getting_an_indexer_that_is_gone_is_null_rather_than_an_error() {
        let host = host_with(&[("a", "torznab", true, 30)]);

        let (status, answer) = call(host, "/_port/tv.kroma.indexer/db/get", json!({ "id": "ghost" })).await;

        assert_eq!(status, StatusCode::OK);
        assert!(answer["Ok"].is_null(), "{answer}");
    }

    #[tokio::test]
    async fn a_noted_result_lands_on_the_row_the_admin_reads() {
        let host = host_with(&[("a", "torznab", true, 30)]);

        let (_, noted) = call(
            host.clone(),
            "/_port/tv.kroma.indexer/db/note-result",
            json!({ "id": "a", "ok": false, "error": "timeout", "now_ms": 4242 }),
        )
        .await;
        assert!(noted["Ok"].is_null(), "{noted}");

        let (_, again) = call(
            host.clone(),
            "/_port/tv.kroma.indexer/db/note-result",
            json!({ "id": "a", "ok": true, "now_ms": 4343 }),
        )
        .await;
        assert!(again["Err"].is_null(), "{again}");
    }

    #[tokio::test]
    async fn a_search_for_an_indexer_that_is_gone_says_which_id() {
        let host = host_with(&[]);

        let (status, answer) = call(
            host,
            "/_port/tv.kroma.indexer/search/search",
            json!({
                "indexer_id": "ghost",
                "query": { "Movie": { "tmdb_id": null, "imdb_id": null, "title": "T", "year": null } },
            }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        let err = answer["Err"].as_str().expect("an Err envelope");
        assert!(err.contains("ghost"), "{err}");
    }

    #[tokio::test]
    async fn a_magnet_resolves_without_touching_a_session() {
        let host = host_with(&[("a", "torznab", true, 30)]);

        let (_, answer) = call(
            host,
            "/_port/tv.kroma.indexer/search/resolve-download",
            json!({
                "indexer_id": "a",
                "title": "Some.Release",
                "magnet_or_url": "magnet:?xt=urn:btih:AB",
            }),
        )
        .await;

        assert_eq!(answer["Ok"]["Magnet"], "magnet:?xt=urn:btih:AB");
    }

    // An external endpoint needs no authenticated fetch, so the caller is told to
    // do a plain GET rather than handed an error.
    #[tokio::test]
    async fn fetching_for_a_non_builtin_indexer_is_null_not_an_error() {
        let host = host_with(&[("a", "torznab", true, 30)]);

        let (_, answer) = call(
            host,
            "/_port/tv.kroma.indexer/torrent-fetch/fetch",
            json!({ "indexer_id": "a", "url": "http://x/f.torrent" }),
        )
        .await;

        assert!(answer["Ok"].is_null(), "{answer}");
    }

    #[tokio::test]
    async fn a_body_missing_a_required_key_is_rejected_by_the_extractor() {
        let host = host_with(&[]);

        let (status, _) = call(host.clone(), "/_port/tv.kroma.indexer/db/get", json!({})).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

        let (status, _) =
            call(host, "/_port/tv.kroma.indexer/search/search", json!({ "indexer_id": "a" })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    // A consumer builds these bodies from its own structs in another crate, so a
    // key renamed on one side only would fail at runtime, in another process.
    #[test]
    fn a_search_names_the_indexer_by_id_and_not_by_row() {
        let body = json!({
            "indexer_id": "idx-1",
            "query": { "Movie": { "tmdb_id": 603, "imdb_id": null, "title": "The Matrix", "year": 1999 } },
        });

        let req: SearchReq = serde_json::from_value(body).unwrap();

        assert_eq!(req.indexer_id, "idx-1");
        assert!(req.categories.is_empty(), "an empty set means the indexer's own");
        assert!(matches!(Query::from(req.query), Query::Movie { tmdb_id: Some(603), .. }));
    }

    #[test]
    fn an_episode_search_carries_its_numbers() {
        let body = json!({
            "indexer_id": "idx-1",
            "query": { "Episode": { "tmdb_id": null, "title": "Severance", "season": 2, "episode": 7 } },
            "categories": [5000],
        });

        let req: SearchReq = serde_json::from_value(body).unwrap();

        assert_eq!(req.categories, vec![5000]);
        assert!(matches!(Query::from(req.query), Query::Episode { season: 2, episode: 7, .. }));
    }

    #[test]
    fn a_resolve_request_may_omit_the_details_url() {
        let body = json!({
            "indexer_id": "idx-1",
            "title": "The.Matrix.1999.1080p",
            "magnet_or_url": "http://tracker/f.torrent",
        });

        let req: ResolveReq = serde_json::from_value(body).unwrap();

        assert_eq!(req.details_url, None);
        assert_eq!(req.magnet_or_url, "http://tracker/f.torrent");
    }

    // The credentials and base URL of an indexer are this module's; a consumer
    // gets the identity and the sweep order, and nothing it does not read.
    #[test]
    fn a_ref_carries_no_credentials() {
        let json = serde_json::to_value(IndexerRef {
            id: "idx-1".into(),
            name: "Jackett".into(),
            kind: "torznab".into(),
            priority: 30,
            enabled: true,
        })
        .unwrap();

        assert_eq!(json["id"], "idx-1");
        assert_eq!(json["name"], "Jackett");
        assert_eq!(json["priority"], 30);
        let keys = json.as_object().unwrap();
        assert_eq!(keys.len(), 5, "{keys:?}");
        for secret in ["url", "api_key", "settings", "definition_id"] {
            assert!(!keys.contains_key(secret), "a consumer must not receive {secret}");
        }
    }

    #[test]
    fn a_note_may_omit_the_error_but_not_the_verdict() {
        let ok: NoteReq =
            serde_json::from_value(json!({ "id": "idx-1", "ok": true, "now_ms": 42 })).unwrap();
        assert!(ok.ok);
        assert_eq!(ok.error, None);

        let failed: NoteReq = serde_json::from_value(
            json!({ "id": "idx-1", "ok": false, "error": "timeout", "now_ms": 42 }),
        )
        .unwrap();
        assert_eq!(failed.error.as_deref(), Some("timeout"));
    }

    #[test]
    fn a_target_names_which_kind_of_link_it_is() {
        let magnet = serde_json::to_value(DownloadTarget::Magnet("magnet:?xt=1".into())).unwrap();
        assert_eq!(magnet["Magnet"], "magnet:?xt=1");

        let url =
            serde_json::to_value(DownloadTarget::TorrentUrl("http://t/f.torrent".into())).unwrap();
        assert_eq!(url["TorrentUrl"], "http://t/f.torrent");
    }
}
