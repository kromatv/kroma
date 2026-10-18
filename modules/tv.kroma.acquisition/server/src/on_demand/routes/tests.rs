use axum::http::StatusCode;
use kroma_module_sdk::host::testing::StubHost;
use serde_json::{json, Value};

use super::routes;
use crate::on_demand::tests::SOLO;
use crate::http::test_support::{admin, call, signed_in, LIBRARIAN};
use crate::search::best::test_world::{host, Fakes};

async fn post(host: &StubHost, path: &str, body: Value) -> (StatusCode, Value) {
    admin(routes::<StubHost>(), host, "POST", path, Some(body)).await
}

async fn ready_host(fakes: &Fakes) -> StubHost {
    signed_in(host(fakes).await)
}

#[tokio::test]
async fn a_search_now_without_a_session_is_refused() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;

    let (status, _) = call(
        routes::<StubHost>(),
        &host,
        "POST",
        "/acquisition/cutoff/search-now",
        None,
        None,
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_title_search_now_queues_its_missing_units_and_kicks_the_job() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;

    let (status, body) = post(&host, "/acquisition/titles/movie/603/search-now", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["started"], true);
    assert_eq!(body["units"], 0);
    assert!(host
        .jobs()
        .iter()
        .any(|(job, _)| *job == "acquisition.ondemand"));
}

#[tokio::test]
async fn a_title_search_now_of_an_unknown_kind_is_refused() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;

    let (status, body) = post(&host, "/acquisition/titles/album/1/search-now", json!({})).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "unknown kind");
}

#[tokio::test]
async fn a_title_search_now_with_too_many_units_is_refused() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;
    let units: Vec<Value> = (0..501)
        .map(|n| json!({ "season": 1, "episode": n }))
        .collect();

    let (status, body) = post(
        &host,
        "/acquisition/titles/show/1396/search-now",
        json!({ "units": units }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "too many units in one search");
}

#[tokio::test]
async fn a_title_search_now_with_no_indexer_says_which_one_is_missing() {
    let _solo = SOLO.lock().await;
    let mut fakes = Fakes::new();
    fakes.indexers.clear();
    let host = ready_host(&fakes).await;

    let (status, body) = post(&host, "/acquisition/titles/movie/603/search-now", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["started"], false);
    assert_eq!(body["reason"], "noIndexer");
}

#[tokio::test]
async fn a_cutoff_search_now_kicks_the_cutoff_job() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;

    let (status, body) = post(&host, "/acquisition/cutoff/search-now", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["started"], true);
    assert!(host
        .jobs()
        .iter()
        .any(|(job, _)| *job == "acquisition.cutoff"));
}

#[tokio::test]
async fn a_cutoff_search_now_behind_a_closed_gate_says_so() {
    let _solo = SOLO.lock().await;
    let mut fakes = Fakes::new();
    fakes.gate = false;
    let host = ready_host(&fakes).await;

    let (status, body) = post(&host, "/acquisition/cutoff/search-now", json!({})).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["started"], false);
    assert_eq!(body["reason"], "vpnClosed");
}

#[tokio::test]
async fn a_librarian_can_start_a_cutoff_search() {
    let _solo = SOLO.lock().await;
    let host = ready_host(&Fakes::new()).await;

    let (status, body) = call(
        routes::<StubHost>(),
        &host,
        "POST",
        "/acquisition/cutoff/search-now",
        Some(LIBRARIAN),
        Some(json!({})),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["started"], true);
}
