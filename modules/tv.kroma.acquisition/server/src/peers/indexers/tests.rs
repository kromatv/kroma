use super::*;

use axum::routing::post;
use axum::{Json, Router};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::testing::{blocking, serve};
use serde_json::{json, Value};

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
fn a_release_carries_the_volume_factors_its_tracker_announced() {
    let json = serde_json::json!({
        "title": "R",
        "guid": "g",
        "download_volume_factor": 0.0,
        "upload_volume_factor": 2.0,
    });

    let release: Release = serde_json::from_value(json).unwrap();

    assert_eq!(release.download_volume_factor, Some(0.0));
    assert_eq!(release.upload_volume_factor, Some(2.0));
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
        Json(Ok(
            serde_json::json!({ "TorrentUrl": req["magnet_or_url"] }),
        ))
    }

    axum::Router::new()
        .route("/_port/tv.kroma.indexer/db/list", post(list))
        .route("/_port/tv.kroma.indexer/db/enabled", post(list))
        .route("/_port/tv.kroma.indexer/db/get", post(get))
        .route("/_port/tv.kroma.indexer/db/note-result", post(note))
        .route("/_port/tv.kroma.indexer/search/search", post(search))
        .route(
            "/_port/tv.kroma.indexer/search/resolve-download",
            post(resolve),
        )
}

async fn indexer_host() -> StubHost {
    let resolve = kroma_module_sdk::testing::serve(fake_indexer(), ()).await;
    let (base, token) = resolve().expect("the fake indexer is up");
    StubHost::new()
        .with_point(INDEXER_DB, None, &base, &token)
        .with_point(INDEXER_SEARCH, None, &base, &token)
}

#[tokio::test]
async fn the_sweep_gets_the_indexers_it_orders_on() {
    let host = indexer_host().await;

    let (all, live) = kroma_module_sdk::testing::blocking(move || {
        (list(&host).unwrap(), enabled(&host).unwrap())
    })
    .await;

    assert_eq!(all.len(), 2);
    assert_eq!(all[0].id, "a");
    assert_eq!(all[0].priority, 30);
    assert_eq!(live[1].kind, KIND_BUILTIN);
}

#[tokio::test]
async fn one_indexer_by_id_or_none_when_it_is_gone() {
    let host = indexer_host().await;

    let (found, missing) = kroma_module_sdk::testing::blocking(move || {
        (get(&host, "a").unwrap(), get(&host, "ghost").unwrap())
    })
    .await;

    assert_eq!(found.unwrap().kind, KIND_BUILTIN);
    assert!(missing.is_none());
}

#[tokio::test]
async fn a_search_names_the_indexer_by_id_and_keeps_both_halves_of_the_answer() {
    let host = indexer_host().await;

    let outcome = kroma_module_sdk::testing::blocking(move || {
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

#[tokio::test]
async fn a_resolved_download_yields_the_link_and_a_note_lands() {
    let host = indexer_host().await;

    let link = kroma_module_sdk::testing::blocking(move || {
        note_result(&host, "a", false, Some("timeout"), 42).unwrap();
        resolve_download(&host, "a", "R", None, "http://t/f.torrent")
            .unwrap()
            .link()
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

async fn search_host(router: Router) -> StubHost {
    let resolve = serve(router, ()).await;
    let (base, token) = resolve().expect("the fake is up");
    StubHost::new().with_point(INDEXER_SEARCH, None, &base, &token)
}

fn any_query() -> Query {
    Query::Text {
        query: "dune".into(),
    }
}

#[tokio::test]
async fn every_indexer_asked_at_once_answers_for_itself_in_the_order_it_was_asked() {
    let host = search_host(Router::new().route(
        "/_port/tv.kroma.indexer/search/search",
        post(|Json(body): Json<Value>| async move {
            let id = body["indexer_id"].as_str().unwrap_or_default().to_string();
            if id == "down" {
                return Json(Err::<Value, String>("tracker down".into()));
            }
            Json(Ok(json!({ "releases": [{ "title": id, "guid": id }], "errors": [] })))
        }),
    ))
    .await;

    let answers = blocking(move || {
        let query = any_query();
        search_all(&host, &[("a", &query), ("down", &query), ("b", &query)])
    })
    .await;

    let [a, down, b] = <[_; 3]>::try_from(answers).expect("one answer per ask");
    assert_eq!(a.unwrap().releases[0].title, "a");
    assert_eq!(down.unwrap_err().to_string(), "tracker down");
    assert_eq!(b.unwrap().releases[0].title, "b");
}

#[tokio::test]
async fn no_indexer_waits_on_another_to_be_asked() {
    let both_here = std::sync::Arc::new(tokio::sync::Barrier::new(2));
    let host = search_host(Router::new().route(
        "/_port/tv.kroma.indexer/search/search",
        post(move |Json(_): Json<Value>| {
            let both_here = both_here.clone();
            async move {
                both_here.wait().await;
                Json(Ok::<_, String>(json!({ "releases": [], "errors": [] })))
            }
        }),
    ))
    .await;

    let answers = blocking(move || {
        let query = any_query();
        search_all(&host, &[("a", &query), ("b", &query)])
    })
    .await;

    assert!(answers.iter().all(Result::is_ok));
}

#[test]
fn nothing_answering_the_point_fails_every_ask_and_says_so() {
    let query = any_query();

    let answers = search_all(&StubHost::new(), &[("a", &query), ("b", &query)]);

    assert_eq!(answers.len(), 2);
    for answer in answers {
        let reason = answer.unwrap_err().to_string();
        assert!(reason.contains(INDEXER_SEARCH), "{reason}");
    }
}
