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

fn offered(id: u64, name: &str, known_for: Vec<Value>) -> Value {
    json!({
        "id": id,
        "name": name,
        "adult": false,
        "known_for_department": "Directing",
        "profile_path": format!("/{id}.jpg"),
        "known_for": known_for,
    })
}

#[test]
fn a_person_offered_carries_a_portrait_a_department_and_three_titles() {
    let known_for = vec![
        json!({ "media_type": "movie", "title": "Heat" }),
        json!({ "media_type": "tv", "name": "Miami Vice" }),
        json!({ "media_type": "movie", "title": "Collateral" }),
        json!({ "media_type": "movie", "title": "Thief" }),
    ];
    let _tmdb = answering(vec![offered(5, "Michael Mann", known_for)]);

    let found = people("key", "en-US", "michael m").unwrap();

    assert_eq!(
        found,
        vec![TmdbPerson {
            tmdb_id: 5,
            name: "Michael Mann".into(),
            photo_url: Some(format!("{IMG}/w342/5.jpg")),
            department: Some("Directing".into()),
            known_for: vec!["Heat".into(), "Miami Vice".into(), "Collateral".into()],
        }]
    );
}

#[test]
fn a_person_tmdb_knows_little_about_is_offered_without_photo_or_department() {
    let _tmdb = answering(vec![json!({ "id": 9, "name": "Jane Doe" })]);

    let found = people("key", "en-US", "jane").unwrap();

    assert_eq!(found[0].photo_url, None);
    assert_eq!(found[0].department, None);
    assert!(found[0].known_for.is_empty());
}

#[test]
fn an_adult_performer_is_never_offered() {
    let adult = json!({ "id": 2, "name": "Jane Adult", "adult": true });
    let _tmdb = answering(vec![adult, offered(3, "Jane Doe", vec![])]);

    let found = people("key", "en-US", "jane").unwrap();

    let ids: Vec<u64> = found.iter().map(|person| person.tmdb_id).collect();
    assert_eq!(ids, vec![3]);
}

#[test]
fn no_more_than_ten_people_are_offered_in_the_order_tmdb_ranks_them() {
    let many = (1..=14).map(|id| offered(id, "Jane", vec![])).collect();
    let _tmdb = answering(many);

    let found = people("key", "en-US", "jane").unwrap();

    let ids: Vec<u64> = found.iter().map(|person| person.tmdb_id).collect();
    assert_eq!(ids, (1..=10).collect::<Vec<u64>>());
}

#[test]
fn tmdb_is_asked_in_the_language_given_and_without_adult_results() {
    let tmdb = answering(vec![]);

    people("key", "fr-FR", "jane").unwrap();

    let asked = tmdb.requests().join(" ");
    assert!(asked.contains("language=fr-FR"), "{asked}");
    assert!(asked.contains("include_adult=false"), "{asked}");
}

#[test]
fn tmdb_out_of_reach_is_an_error_and_not_an_empty_list() {
    let _tmdb = FakeTmdb::start(|_| (500, json!({})));

    let found = people("key", "en-US", "jane");

    assert!(found.is_err());
}
