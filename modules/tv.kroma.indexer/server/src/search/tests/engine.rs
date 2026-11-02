use crate::peers;

use super::{db_pool, port_query, seed_row, DbHost};
use crate::{db, search};

#[test]
fn a_torznab_search_without_the_torznab_engine_names_the_missing_piece() {
    let pool = db_pool();
    let mut row = seed_row("tz-no-engine", "torznab", true, 100);
    row.url = "http://tracker.invalid/api".into();
    db::insert_indexer(&pool, &row).unwrap();
    let host = DbHost::with_store(pool.clone());

    let err = search::run(&host, &row, &port_query(), &[2000])
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("no module answers tv.kroma.indexer/engine as torznab"),
        "{err}"
    );

    let stored = db::get_indexer(&pool.get().unwrap(), "tz-no-engine")
        .unwrap()
        .unwrap();
    assert_eq!(stored.last_ok_at, None);
    assert!(
        stored
            .last_error
            .as_deref()
            .unwrap_or_default()
            .contains("torznab"),
        "the failure was not recorded on the row: {:?}",
        stored.last_error
    );
}

fn fake_torznab() -> axum::Router<()> {
    use axum::routing::post;
    use axum::Json;
    use serde_json::{json, Value};

    async fn caps(Json(endpoint): Json<Value>) -> Json<Result<Value, String>> {
        let url = endpoint["url"].as_str().unwrap_or_default().to_string();
        Json(Ok(json!({ "search_tmdb": true, "server_title": url })))
    }

    async fn search(Json(req): Json<Value>) -> Json<Result<Vec<Value>, String>> {
        assert_eq!(
            req["caps"]["search_tmdb"], true,
            "the caps probe result must reach the search call"
        );
        let url = req["endpoint"]["url"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        assert!(
            req["query"]["Movie"].is_object(),
            "the query crossed as {:?}",
            req["query"]
        );
        Json(Ok(vec![
            json!({ "title": "From The Endpoint", "guid": url }),
        ]))
    }

    axum::Router::new()
        .route("/_port/tv.kroma.indexer/engine/caps", post(caps))
        .route("/_port/tv.kroma.indexer/engine/search", post(search))
}

#[tokio::test]
async fn a_row_of_a_kind_this_module_never_heard_of_reaches_its_contributor() {
    let pool = db_pool();
    let mut row = seed_row("pl-1", "prowlarr", true, 100);
    row.url = "http://prowlarr.example/api".into();
    db::insert_indexer(&pool, &row).unwrap();
    let resolve = kroma_module_sdk::testing::serve(fake_torznab(), ()).await;
    let (base, token) = resolve().expect("the fake engine is up");
    let host =
        DbHost::with_store(pool.clone()).with_point(peers::ENGINE, Some("prowlarr"), &base, &token);

    let outcome = kroma_module_sdk::testing::blocking(move || {
        search::run(&host, &row, &port_query(), &[2000])
    })
    .await
    .unwrap();

    assert_eq!(outcome.releases.len(), 1);
    assert_eq!(outcome.releases[0].guid, "http://prowlarr.example/api");
}

#[tokio::test]
async fn a_torznab_search_goes_out_through_the_resolved_provider() {
    let pool = db_pool();
    let mut row = seed_row("tz-engine", "torznab", true, 100);
    row.url = "http://tracker.example/api".into();
    db::insert_indexer(&pool, &row).unwrap();
    let resolve = kroma_module_sdk::testing::serve(fake_torznab(), ()).await;
    let (base, token) = resolve().expect("the fake provider is up");
    let host =
        DbHost::with_store(pool.clone()).with_point(peers::ENGINE, Some("torznab"), &base, &token);

    let outcome = kroma_module_sdk::testing::blocking(move || {
        search::run(&host, &row, &port_query(), &[2000])
    })
    .await
    .unwrap();

    assert!(outcome.errors.is_empty());
    assert_eq!(outcome.releases.len(), 1);
    assert_eq!(outcome.releases[0].title, "From The Endpoint");
    assert_eq!(outcome.releases[0].guid, "http://tracker.example/api");

    let stored = db::get_indexer(&pool.get().unwrap(), "tz-engine")
        .unwrap()
        .unwrap();
    assert!(
        stored.last_ok_at.is_some(),
        "a successful probe must clear the row's error state"
    );
    assert_eq!(stored.last_error, None);
}
