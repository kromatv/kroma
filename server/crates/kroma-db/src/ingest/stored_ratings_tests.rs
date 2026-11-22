use rusqlite::params;

use kroma_domain::{AgeRating, CountryRatings, Metadata};

use super::test_support::{meta, pool};
use super::{set_item_metadata, set_show_metadata};

fn rated(tmdb: u64, title: &str) -> Metadata {
    let ratings: CountryRatings = [("FR", "12"), ("US", "R")]
        .into_iter()
        .map(|(c, l)| (c.to_string(), l.to_string()))
        .collect();
    Metadata {
        ratings,
        age_rating: Some(AgeRating {
            label: "12".into(),
            country: "FR".into(),
            borrowed: false,
        }),
        ..meta(tmdb, title)
    }
}

fn seed(p: &crate::Pool) {
    let conn = p.get().unwrap();
    conn.execute_batch(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t');
         INSERT INTO items (id,kind,title,container,library,added_at)
           VALUES ('m1','movie','Dune','mkv','lib','t');
         INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t');",
    )
    .unwrap();
}

#[test]
fn a_films_stored_metadata_keeps_every_countrys_label() {
    let p = pool();
    seed(&p);

    set_item_metadata(&p, "m1", &rated(603, "Dune")).unwrap();

    let stored = crate::get_item(&p, "m1").unwrap().unwrap().metadata.unwrap();
    assert_eq!(stored.ratings, rated(603, "Dune").ratings);
    assert_eq!(stored.age_rating, rated(603, "Dune").age_rating);
}

#[test]
fn a_shows_stored_metadata_keeps_every_countrys_label() {
    let p = pool();
    seed(&p);

    set_show_metadata(&p, "s1", &rated(1396, "Show")).unwrap();

    let conn = p.get().unwrap();
    let blob: String = conn
        .query_row("SELECT metadata FROM shows WHERE id = ?1", params!["s1"], |r| r.get(0))
        .unwrap();
    let stored: Metadata = serde_json::from_str(&blob).unwrap();
    assert_eq!(stored.ratings.get("US").map(String::as_str), Some("R"));
}

#[test]
fn a_client_is_sent_the_readers_rating_and_never_every_countrys_label() {
    let p = pool();
    seed(&p);
    set_item_metadata(&p, "m1", &rated(603, "Dune")).unwrap();

    let item = crate::get_item(&p, "m1").unwrap().unwrap();

    let wire = serde_json::to_value(&item).unwrap();
    assert!(wire["metadata"].get("ratings").is_none());
    assert_eq!(
        wire["metadata"]["ageRating"],
        serde_json::json!({"label": "12", "country": "FR", "borrowed": false})
    );
}
