use axum::routing::post;
use axum::Json;
use kroma_module_sdk::db;
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use kroma_module_sdk::testing::serve;
use serde_json::{json, Value};

use crate::peers::downloads::DOWNLOAD_GRAB;
use crate::peers::indexers::{INDEXER_DB, INDEXER_SEARCH};
use crate::search::best::test_world::release_json;

fn download_row(spec: &Value) -> Value {
    json!({
        "id": "dl1",
        "request_id": null,
        "kind": spec["kind"],
        "tmdb_id": spec["tmdb_id"],
        "title": spec["title"],
        "release_title": spec["release_title"],
        "magnet_or_url": spec["magnet_or_url"],
        "status": "queued",
        "upgrade": false,
        "content_rel_paths": [],
    })
}

pub(super) async fn host(releases: &[&str]) -> StubHost {
    let releases: Vec<Value> = releases.iter().map(|t| release_json(t)).collect();
    let indexer = json!({
        "id": "idx1", "name": "Tracker", "kind": "torznab", "priority": 30, "enabled": true
    });
    let listed = indexer.clone();
    let router = axum::Router::new()
        .route(
            "/_port/tv.kroma.torrents/grab/grab",
            post(
                |Json(spec): Json<Value>| async move { Json(Ok::<_, String>(download_row(&spec))) },
            ),
        )
        .route(
            "/_port/tv.kroma.torrents/grab/activate",
            post(|Json(_): Json<Value>| async { Json(Ok::<_, String>(true)) }),
        )
        .route(
            "/_port/tv.kroma.indexer/db/enabled",
            post(move |Json(_): Json<Value>| {
                let listed = listed.clone();
                async move { Json(Ok::<_, String>(vec![listed])) }
            }),
        )
        .route(
            "/_port/tv.kroma.indexer/db/get",
            post(move |Json(_): Json<Value>| {
                let indexer = indexer.clone();
                async move { Json(Ok::<_, String>(Some(indexer))) }
            }),
        )
        .route(
            "/_port/tv.kroma.indexer/db/note-result",
            post(|Json(_): Json<Value>| async { Json(Ok::<_, String>(())) }),
        )
        .route(
            "/_port/tv.kroma.indexer/search/search",
            post(move |Json(_): Json<Value>| {
                let releases = releases.clone();
                async move {
                    Json(Ok::<_, String>(
                        json!({ "releases": releases, "errors": [] }),
                    ))
                }
            }),
        );
    let resolve = serve(router, ()).await;
    let (base, token) = resolve().expect("the fakes are up");
    let host = StubHost::with_core(db::testing::temp_pool("acq-grab"))
        .with_point(DOWNLOAD_GRAB, None, &base, &token)
        .with_point(INDEXER_DB, None, &base, &token)
        .with_point(INDEXER_SEARCH, None, &base, &token);
    db::apply_migrations(
        &host.store().get().unwrap(),
        crate::rules::schema::MIGRATIONS,
    )
    .unwrap();
    host
}
