use axum::http::StatusCode;
use kroma_requests::testing::FakeTmdb;
use serde_json::{json, Value};

use crate::api::test_support::{get, raw, test_app_with_tmdb, TestApp};

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

fn sender() -> Value {
    json!({
        "id": 1_464_544,
        "title": "L'Expéditeur",
        "original_title": "Sender",
        "overview": "",
        "tagline": "",
        "release_date": "2027-04-23",
        "production_companies": [{ "name": "Comet Pictures" }, { "name": "TPC" }],
        "release_dates": { "results": [{ "iso_3166_1": "US", "release_dates": [
            { "type": 3, "certification": "R", "release_date": "2027-04-23T00:00:00.000Z" }
        ]}]},
        "translations": { "translations": [{ "iso_639_1": "en", "iso_3166_1": "US", "data": {
            "overview": "A woman tumbles down a paranoid rabbit hole.", "tagline": ""
        }}]}
    })
}

fn severance() -> Value {
    json!({
        "id": 95_396,
        "name": "Severance",
        "original_name": "Severance",
        "overview": "Mark leads a team of office workers.",
        "networks": [{ "name": "Apple TV+" }],
        "production_companies": [{ "name": "Red Hour" }],
        "content_ratings": { "results": [{ "iso_3166_1": "US", "rating": "TV-MA" }] },
        "seasons": [
            { "season_number": 0, "episode_count": 3 },
            { "season_number": 1, "episode_count": 9, "name": "Season 1" }
        ],
        "next_episode_to_air": { "air_date": "2027-01-17", "season_number": 3, "episode_number": 1 }
    })
}

async fn read_in_french(t: &TestApp, uri: &str) -> (StatusCode, Value) {
    let french = [("accept-language", "fr")];
    let (status, _, body) = raw(&t.app, "GET", uri, Some(&t.token), None, &french).await;
    (status, body)
}

#[tokio::test]
async fn a_film_never_described_in_the_asked_language_reads_its_english_overview() {
    let t = test_app_with_tmdb();
    let _tmdb = FakeTmdb::start_shared(|_| (200, sender()));

    let (status, body) = read_in_french(&t, "/api/discover/movie/1464544").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["overview"],
        "A woman tumbles down a paranoid rabbit hole."
    );
    assert_eq!(body["tagline"], Value::Null);
}

#[tokio::test]
async fn a_film_detail_names_its_studios_age_rating_and_original_title() {
    let t = test_app_with_tmdb();
    let _tmdb = FakeTmdb::start_shared(|_| (200, sender()));

    let (_, body) = read_in_french(&t, "/api/discover/movie/1464544").await;

    assert_eq!(body["studios"], json!(["Comet Pictures", "TPC"]));
    assert_eq!(body["ageRating"]["label"], "R");
    assert_eq!(body["originalTitle"], "Sender");
}

#[tokio::test]
async fn a_show_detail_names_its_network_and_its_rating() {
    let t = test_app_with_tmdb();
    let _tmdb = FakeTmdb::start_shared(|_| (200, severance()));

    let (_, body) = read_in_french(&t, "/api/discover/tv/95396").await;

    assert_eq!(body["studios"], json!(["Apple TV+"]));
    assert_eq!(body["ageRating"]["label"], "TV-MA");
    assert_eq!(body["originalTitle"], Value::Null);
    assert_eq!(body["seasons"].as_array().map(Vec::len), Some(1));
    assert_eq!(body["nextAirDate"], "2027-01-17");
}
