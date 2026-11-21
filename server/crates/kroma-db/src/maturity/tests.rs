use super::*;
use crate::testing::{TempPool, temp_pool};

fn seeded() -> TempPool {
    let pool = temp_pool("maturity");
    let conn = pool.get().unwrap();
    conn.execute_batch(
        r#"INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('films','Films','movies','/m','t');
           INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('series','Series','shows','/s','t');
           INSERT INTO items (id,kind,title,container,library,added_at,metadata) VALUES ('m1','movie','A','mkv','films','t','{"ratings":{"FR":"12","US":"PG-13"},"certification":"12"}');
           INSERT INTO items (id,kind,title,container,library,added_at,metadata) VALUES ('m2','movie','Old','mkv','films','t','{"certification":"16"}');
           INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m3','movie','Home video','mkv','films','t');
           INSERT INTO shows (id,title,library,added_at,metadata) VALUES ('s1','S','series','t','{"ratings":{"US":"TV-Y7"}}');
           INSERT INTO items (id,kind,title,container,library,show_id,added_at,metadata) VALUES ('e1','episode','B','mkv','series','s1','t','{"ratings":{"US":"TV-MA"}}');
           INSERT INTO users (id,email,username,password_hash,permissions,created_at) VALUES ('u1','a@b.c','alice','h','["playback"]','t');"#,
    )
    .unwrap();
    pool
}

fn ratings(pairs: &[(&str, &str)]) -> CountryRatings {
    pairs
        .iter()
        .map(|(c, l)| (c.to_string(), l.to_string()))
        .collect()
}

fn ids(raw: &[&str]) -> Vec<String> {
    raw.iter().map(ToString::to_string).collect()
}

#[test]
fn an_account_that_never_chose_reads_eighteen_and_the_servers_country() {
    let pool = seeded();

    assert_eq!(
        profile_maturity(&pool, "u1").unwrap(),
        ProfileMaturity::default()
    );
    assert_eq!(
        profile_maturity(&pool, "ghost").unwrap(),
        ProfileMaturity::default()
    );
}

#[test]
fn a_level_and_a_country_round_trip_through_the_account_row() {
    let pool = seeded();

    assert!(set_maturity_level(&pool, "u1", MaturityLevel::Seven).unwrap());
    set_ratings_country(&pool, "u1", Some("DE")).unwrap();

    assert_eq!(
        profile_maturity(&pool, "u1").unwrap(),
        ProfileMaturity {
            level: MaturityLevel::Seven,
            ratings_country: Some("DE".into()),
        }
    );
}

#[test]
fn eighteen_is_stored_as_the_null_every_account_started_with() {
    let pool = seeded();
    set_maturity_level(&pool, "u1", MaturityLevel::Ten).unwrap();

    set_maturity_level(&pool, "u1", MaturityLevel::Adult).unwrap();

    let stored: Option<i64> = pool
        .get()
        .unwrap()
        .query_row("SELECT maturity FROM users WHERE id = 'u1'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(stored, None);
    assert!(!set_maturity_level(&pool, "ghost", MaturityLevel::Ten).unwrap());
}

#[test]
fn a_stored_age_that_is_no_level_reads_as_the_strictest_level_below_it() {
    let pool = seeded();
    pool.get()
        .unwrap()
        .execute("UPDATE users SET maturity = 12 WHERE id = 'u1'", [])
        .unwrap();

    assert_eq!(
        profile_maturity(&pool, "u1").unwrap().level,
        MaturityLevel::Ten
    );
}

#[test]
fn a_film_is_held_to_its_own_ratings_and_an_episode_to_its_shows() {
    let pool = seeded();

    let found = items_access(&pool, &ids(&["m1", "e1", "ghost"])).unwrap();

    assert_eq!(found.len(), 2);
    assert_eq!(found["m1"].library, "films");
    assert_eq!(
        found["m1"].ratings,
        ratings(&[("FR", "12"), ("US", "PG-13")])
    );
    assert_eq!(found["e1"].library, "series");
    assert_eq!(found["e1"].ratings, ratings(&[("US", "TV-Y7")]));
}

#[test]
fn a_title_enriched_before_every_country_was_kept_brings_its_bare_label() {
    let pool = seeded();

    let found = items_access(&pool, &ids(&["m2", "m3"])).unwrap();

    assert!(found["m2"].ratings.is_empty());
    assert_eq!(found["m2"].certification.as_deref(), Some("16"));
    assert_eq!(
        found["m3"],
        TitleAccess {
            library: "films".into(),
            ..TitleAccess::default()
        }
    );
}

#[test]
fn a_saved_subject_is_held_to_its_item_or_its_show() {
    let pool = seeded();

    let found = subjects_access(&pool, &ids(&["m1", "s1", "tmdb:603"])).unwrap();

    assert_eq!(found.len(), 2);
    assert_eq!(found["s1"].ratings, ratings(&[("US", "TV-Y7")]));
    assert!(shows_access(&pool, &[]).unwrap().is_empty());
}

#[test]
fn the_whole_catalogue_is_every_film_and_every_show_and_no_episode() {
    let pool = seeded();

    let mut found: Vec<String> = every_title_access(&pool).unwrap().into_keys().collect();

    found.sort();
    assert_eq!(found, ids(&["m1", "m2", "m3", "s1"]));
}
