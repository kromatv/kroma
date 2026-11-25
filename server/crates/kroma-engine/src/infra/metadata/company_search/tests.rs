use serde_json::{json, Value};

use super::*;
use crate::test_support::FakeTmdb;

fn answering(results: Vec<Value>) -> FakeTmdb {
    FakeTmdb::start(move |path| match path {
        "/search/company" => (200, json!({ "results": results })),
        _ => (404, json!({})),
    })
}

fn company(id: u64, name: &str) -> Value {
    json!({ "id": id, "name": name, "logo_path": format!("/{id}.png"), "origin_country": "US" })
}

#[test]
fn a_studio_offered_carries_its_logo_and_its_country() {
    let _tmdb = answering(vec![company(11, "Forward Pass")]);

    let found = studios("key", "forward").unwrap();

    assert_eq!(
        found,
        vec![TmdbStudio {
            tmdb_id: 11,
            name: "Forward Pass".into(),
            logo_url: Some(format!("{IMG}/w185/11.png")),
            country: Some("US".into()),
        }]
    );
}

#[test]
fn a_studio_without_a_logo_or_a_country_is_offered_without_them() {
    let bare = json!({ "id": 12, "name": "Nobody Films", "logo_path": null, "origin_country": "" });
    let _tmdb = answering(vec![bare]);

    let found = studios("key", "nobody").unwrap();

    assert_eq!(found[0].logo_url, None);
    assert_eq!(found[0].country, None);
}

#[test]
fn no_more_than_ten_studios_are_offered_in_the_order_tmdb_ranks_them() {
    let many = (1..=14).map(|id| company(id, "Studio")).collect();
    let _tmdb = answering(many);

    let found = studios("key", "studio").unwrap();

    let ids: Vec<u64> = found.iter().map(|studio| studio.tmdb_id).collect();
    assert_eq!(ids, (1..=10).collect::<Vec<u64>>());
}

#[test]
fn tmdb_out_of_reach_is_an_error_and_not_an_empty_list() {
    let _tmdb = FakeTmdb::start(|_| (500, json!({})));

    let found = studios("key", "studio");

    assert!(found.is_err());
}
