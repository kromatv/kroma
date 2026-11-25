use axum::http::StatusCode;
use kroma_requests::testing::FakeTmdb;
use serde_json::{json, Value};

use crate::api::test_support::{get, raw, seed_session, test_app, test_app_with_tmdb, TestApp};
use crate::model::Permission;

fn tmdb_offering_mann_and_forward_pass() -> FakeTmdb {
    FakeTmdb::start_shared(|path| match path {
        "/search/person" => (
            200,
            json!({ "results": [{
                "id": 5,
                "name": "Michael Mann",
                "known_for_department": "Directing",
                "profile_path": "/5.jpg",
                "known_for": [{ "media_type": "movie", "title": "Heat" }],
            }] }),
        ),
        "/search/company" => (
            200,
            json!({ "results": [{ "id": 11, "name": "Forward Pass", "logo_path": null, "origin_country": "US" }] }),
        ),
        _ => (404, json!({})),
    })
}

async fn read_in_french(t: &TestApp, uri: &str) -> (StatusCode, Value) {
    let headers = [("accept-language", "fr")];
    let (status, _, body) = raw(&t.app, "GET", uri, Some(&t.token), None, &headers).await;
    (status, body)
}

#[tokio::test]
async fn the_people_tmdb_offers_for_a_name_come_with_a_photo_a_department_and_titles() {
    let t = test_app_with_tmdb();
    let tmdb = tmdb_offering_mann_and_forward_pass();

    let (status, found) = read_in_french(&t, "/api/edits/people?q=%20michael%20").await;

    let asked = tmdb.requests().join(" ");
    let mann = &found["results"][0];
    let photo = mann["photoUrl"].as_str().unwrap_or_default();
    assert_eq!(status, StatusCode::OK);
    assert_eq!(found["results"].as_array().map(Vec::len), Some(1));
    assert_eq!(mann["tmdbId"], json!(5));
    assert_eq!(mann["name"], json!("Michael Mann"));
    assert_eq!(mann["department"], json!("Directing"));
    assert_eq!(mann["knownFor"], json!(["Heat"]));
    assert!(photo.starts_with("/api/images/tmdb/"), "{photo}");
    assert!(photo.ends_with("/w342/5.jpg"), "{photo}");
    assert!(asked.contains("query=michael&"), "{asked}");
    assert!(asked.contains("language=fr-FR"), "{asked}");
}

#[tokio::test]
async fn the_studios_tmdb_offers_for_a_name_come_with_a_logo_and_a_country() {
    let t = test_app_with_tmdb();
    let _tmdb = tmdb_offering_mann_and_forward_pass();

    let (status, found) = read_in_french(&t, "/api/edits/studios?q=forward").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        found,
        json!({ "results": [{ "tmdbId": 11, "name": "Forward Pass", "logoUrl": null, "country": "US" }] })
    );
}

#[tokio::test]
async fn a_blank_name_offers_nobody_without_asking_tmdb() {
    let t = test_app_with_tmdb();
    let tmdb = tmdb_offering_mann_and_forward_pass();

    let (_, people) = get(&t.app, "/api/edits/people?q=%20%20", Some(&t.token)).await;
    let (_, studios) = get(&t.app, "/api/edits/studios", Some(&t.token)).await;

    assert_eq!(people, json!({ "results": [] }));
    assert_eq!(studios, json!({ "results": [] }));
    assert_eq!(tmdb.requests(), Vec::<String>::new());
}

#[tokio::test]
async fn a_name_longer_than_a_hundred_characters_is_refused() {
    let t = test_app_with_tmdb();
    let long = format!("/api/edits/people?q={}", "a".repeat(101));
    let longest = format!("/api/edits/studios?q={}", "a".repeat(101));

    let (people, _) = get(&t.app, &long, Some(&t.token)).await;
    let (studios, _) = get(&t.app, &longest, Some(&t.token)).await;

    assert_eq!(people, StatusCode::BAD_REQUEST);
    assert_eq!(studios, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn names_are_offered_only_to_whoever_manages_the_library() {
    let t = test_app_with_tmdb();
    let (_uid, viewer) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );

    let (people, _) = get(&t.app, "/api/edits/people?q=mann", Some(&viewer)).await;
    let (studios, _) = get(&t.app, "/api/edits/studios?q=pass", Some(&viewer)).await;

    assert_eq!(people, StatusCode::FORBIDDEN);
    assert_eq!(studios, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_server_without_a_tmdb_key_offers_nobody() {
    let t = test_app();

    let (people, offered) = get(&t.app, "/api/edits/people?q=mann", Some(&t.token)).await;
    let (studios, _) = get(&t.app, "/api/edits/studios?q=pass", Some(&t.token)).await;

    assert_eq!(people, StatusCode::OK);
    assert_eq!(studios, StatusCode::OK);
    assert_eq!(offered, json!({ "results": [] }));
}

#[tokio::test]
async fn tmdb_out_of_reach_is_a_bad_gateway_rather_than_nobody() {
    let t = test_app_with_tmdb();
    let _tmdb = FakeTmdb::start_shared(|_| (500, json!({})));

    let (people, _) = get(&t.app, "/api/edits/people?q=mann", Some(&t.token)).await;
    let (studios, _) = get(&t.app, "/api/edits/studios?q=pass", Some(&t.token)).await;

    assert_eq!(people, StatusCode::BAD_GATEWAY);
    assert_eq!(studios, StatusCode::BAD_GATEWAY);
}
