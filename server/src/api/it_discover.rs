use axum::http::StatusCode;
use kroma_requests::testing::FakeTmdb;
use serde_json::{json, Value};

use crate::api::test_support::{get, test_app_with_tmdb};

fn film(n: u64) -> Value {
    json!({ "id": 9_000 + n, "title": format!("Film {n}"), "poster_path": format!("/{n}.jpg") })
}

fn seventy_films() -> Value {
    let results: Vec<Value> = (1..=70).map(film).collect();
    json!({ "page": 1, "total_pages": 1, "results": results })
}

fn titles(body: &Value) -> usize {
    body["results"].as_array().map_or(0, Vec::len)
}

fn trending_reads(tmdb: &FakeTmdb) -> usize {
    tmdb.requests()
        .iter()
        .filter(|target| target.starts_with("/trending/movie/week"))
        .count()
}

#[tokio::test]
async fn a_trending_page_holds_sixty_titles_and_counts_the_pages_of_its_list() {
    let t = test_app_with_tmdb();
    let _tmdb = FakeTmdb::start_shared(|_| (200, seventy_films()));

    let (status, body) = get(&t.app, "/api/discover/trending?type=movie", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(titles(&body), 60);
    assert_eq!(body["totalPages"], 2);
}

#[tokio::test]
async fn the_next_trending_page_comes_from_the_same_read() {
    let t = test_app_with_tmdb();
    let tmdb = FakeTmdb::start_shared(|_| (200, seventy_films()));
    get(&t.app, "/api/discover/trending?type=movie", Some(&t.token)).await;

    let (_, body) = get(
        &t.app,
        "/api/discover/trending?type=movie&page=2",
        Some(&t.token),
    )
    .await;

    assert_eq!((titles(&body), body["page"].clone()), (10, json!(2)));
    assert_eq!(trending_reads(&tmdb), 1);
}
