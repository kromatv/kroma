use super::*;

use crate::media::test_support::pool;
use crate::metadata_core::{ITEM, SHOW};
use crate::testing::TempPool;
use crate::title_edits::{self, Title};
use kroma_domain::title_edit::{Actor, TitleEdit};
use rusqlite::params;

type Credited<'a> = (&'a str, Option<u64>);

fn credits(cast: &[Credited], crew: &[Credited]) -> String {
    let person = |(name, id): &Credited| serde_json::json!({"name": name, "tmdbId": id});
    let director =
        |(name, id): &Credited| serde_json::json!({"name": name, "tmdbId": id, "job": "Director"});
    serde_json::json!({
        "tmdbId": 1,
        "tmdbUrl": "x",
        "genres": [],
        "cast": cast.iter().map(person).collect::<Vec<_>>(),
        "crew": crew.iter().map(director).collect::<Vec<_>>(),
    })
    .to_string()
}

fn wrote(pool: &Pool, (kind, id): (&str, &str), edit: TitleEdit) {
    title_edits::write(pool, Title { kind, id }, &edit).unwrap();
}

fn directed(names: &[&str]) -> TitleEdit {
    TitleEdit {
        directors: Some(names.iter().map(ToString::to_string).collect()),
        ..Default::default()
    }
}

fn played(names: &[&str]) -> TitleEdit {
    let actor = |name: &&str| Actor {
        name: name.to_string(),
        role: None,
    };
    TitleEdit {
        cast: Some(names.iter().map(actor).collect()),
        ..Default::default()
    }
}

fn seeded_pool() -> TempPool {
    let pool = pool();
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t')",
        [],
    )
    .unwrap();
    let movie = |id: &str, cast: &[Credited], crew: &[Credited]| {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
             VALUES (?1,'movie',?1,'mkv','lib','t',?2)",
            params![id, credits(cast, crew)],
        )
        .unwrap();
    };
    movie(
        "m1",
        &[("Timothée Chalamet", Some(1234))],
        &[("Denis Villeneuve", None)],
    );
    movie(
        "m2",
        &[("Emily Blunt", None)],
        &[("Denis Villeneuve", None)],
    );
    conn.execute(
        "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','S','t',?1)",
        params![credits(
            &[("Adam Scott", None)],
            &[("Ben Stiller", Some(77))]
        )],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at,metadata) \
         VALUES ('e1','episode','Ep1','mkv','lib','s1',1,1,'t',?1)",
        params![credits(&[("Adam Scott", None)], &[])],
    )
    .unwrap();
    drop(conn);
    pool
}

#[test]
fn a_slug_finds_every_movie_and_show_crediting_the_person_it_names() {
    let pool = seeded_pool();

    let director = resolve_person(&pool, "denis-villeneuve").unwrap().unwrap();
    let actor = resolve_person(&pool, "timothee-chalamet").unwrap().unwrap();

    assert_eq!(director.name, "Denis Villeneuve");
    assert_eq!(director.movie_ids, ["m1", "m2"]);
    assert!(director.show_ids.is_empty());
    assert_eq!(actor.movie_ids, ["m1"]);
}

#[test]
fn a_credit_on_a_show_never_drags_in_its_episodes() {
    let pool = seeded_pool();

    let found = resolve_person(&pool, "adam-scott").unwrap().unwrap();

    assert_eq!(found.show_ids, ["s1"]);
    assert!(found.movie_ids.is_empty());
}

#[test]
fn a_display_name_finds_what_its_slug_finds_so_older_clients_keep_working() {
    let pool = seeded_pool();

    let by_name = resolve_person(&pool, "Timothée Chalamet").unwrap();

    assert_eq!(by_name, resolve_person(&pool, "timothee-chalamet").unwrap());
}

#[test]
fn a_stored_person_id_answers_on_its_own() {
    let pool = seeded_pool();

    let found = resolve_person(&pool, "1234").unwrap().unwrap();

    assert_eq!(found.name, "Timothée Chalamet");
    assert_eq!(found.tmdb_id, Some(1234));
    assert_eq!(found.movie_ids, ["m1"]);
}

#[test]
fn a_credit_stored_before_ids_were_kept_reports_none() {
    let pool = seeded_pool();

    let found = resolve_person(&pool, "denis-villeneuve").unwrap().unwrap();

    assert_eq!(found.tmdb_id, None);
}

#[test]
fn an_uncredited_or_blank_lookup_finds_nobody() {
    let pool = seeded_pool();

    assert!(resolve_person(&pool, "Nobody").unwrap().is_none());
    assert!(resolve_person(&pool, "  ").unwrap().is_none());
}

#[test]
fn directors_written_for_a_title_stand_in_for_the_provider_s_on_their_pages() {
    let pool = seeded_pool();
    wrote(&pool, (ITEM, "m1"), directed(&["Jane Doe"]));

    let replaced = resolve_person(&pool, "denis-villeneuve").unwrap().unwrap();
    let written = resolve_person(&pool, "jane-doe").unwrap().unwrap();

    assert_eq!(replaced.movie_ids, ["m2"]);
    assert_eq!(written.movie_ids, ["m1"]);
}

#[test]
fn a_director_written_under_the_provider_s_name_keeps_the_provider_s_id() {
    let pool = seeded_pool();
    wrote(&pool, (SHOW, "s1"), directed(&["ben stiller"]));

    let found = resolve_person(&pool, "77").unwrap().unwrap();

    assert_eq!(found.tmdb_id, Some(77));
    assert_eq!(found.show_ids, ["s1"]);
}

#[test]
fn a_cast_written_for_a_title_stands_in_for_the_provider_s_on_their_pages() {
    let pool = seeded_pool();
    wrote(&pool, (ITEM, "m1"), played(&["Jane Doe"]));

    let replaced = resolve_person(&pool, "timothee-chalamet").unwrap();
    let written = resolve_person(&pool, "jane-doe").unwrap().unwrap();

    assert!(replaced.is_none());
    assert_eq!(written.movie_ids, ["m1"]);
}

#[test]
fn an_actor_written_under_the_provider_s_name_keeps_the_provider_s_id() {
    let pool = seeded_pool();
    wrote(
        &pool,
        (ITEM, "m1"),
        played(&["timothée chalamet", "Emily Blunt"]),
    );

    let found = resolve_person(&pool, "1234").unwrap().unwrap();
    let both = resolve_person(&pool, "emily-blunt").unwrap().unwrap();

    assert_eq!(found.tmdb_id, Some(1234));
    assert_eq!(found.movie_ids, ["m1"]);
    assert_eq!(both.movie_ids, ["m1", "m2"]);
}
