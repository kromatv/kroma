use serde_json::{json, Value};

use super::*;
use crate::test_support::FakeTmdb;

fn hit(id: u64, name: &str, popularity: f64) -> Value {
    json!({ "id": id, "name": name, "popularity": popularity, "profile_path": format!("/{id}.jpg") })
}

fn answering(results: Vec<Value>) -> FakeTmdb {
    FakeTmdb::start(move |path| match path {
        "/search/person" => (200, json!({ "results": results })),
        _ => (404, json!({})),
    })
}

#[test]
fn the_best_known_person_of_that_exact_name_is_the_one_found() {
    let _tmdb = answering(vec![
        hit(1, "Zoe Saldana Fan", 90.0),
        hit(2, "Zoë Saldaña", 40.0),
        hit(3, "Zoe Saldana", 2.0),
    ]);

    let found = named("key", "Zoe Saldana").unwrap();

    let portrait = format!("{IMG}/w342/2.jpg");
    assert_eq!(
        found,
        Some(Person {
            tmdb_id: 2,
            profile_url: Some(portrait)
        })
    );
}

#[test]
fn a_name_tmdb_has_nobody_under_finds_nobody() {
    let _tmdb = answering(vec![hit(1, "John Smith", 10.0)]);

    let found = named("key", "Jon Smith").unwrap();

    assert_eq!(found, None);
}

#[test]
fn a_person_without_a_portrait_is_found_without_one() {
    let _tmdb = answering(vec![
        json!({ "id": 7, "name": "Jane Doe", "profile_path": null }),
    ]);

    let found = named("key", "Jane Doe").unwrap();

    assert_eq!(
        found,
        Some(Person {
            tmdb_id: 7,
            profile_url: None
        })
    );
}

#[test]
fn tmdb_out_of_reach_is_an_error_and_not_nobody() {
    let _tmdb = FakeTmdb::start(|_| (500, json!({})));

    let found = named("key", "Jane Doe");

    assert!(found.is_err());
}
