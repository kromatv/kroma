use rusqlite::params;

use super::*;
use crate::metadata_core::{ITEM, SHOW};
use crate::testing::{temp_pool, TempPool};
use crate::title_edits::{self, Title};
use kroma_domain::title_edit::Actor;

fn provider(cast: &[&str], directors: &[&str]) -> String {
    let director = |name: &&str| serde_json::json!({"name": name, "tmdbId": 9, "job": "Director"});
    serde_json::json!({
        "tmdbId": 1,
        "tmdbUrl": "x",
        "genres": [],
        "cast": cast.iter().map(|name| serde_json::json!({"name": name, "tmdbId": 8})).collect::<Vec<_>>(),
        "crew": directors.iter().map(director).collect::<Vec<_>>(),
    })
    .to_string()
}

fn written(cast: &[&str], directors: &[&str]) -> TitleEdit {
    let actor = |name: &&str| Actor {
        name: name.to_string(),
        role: None,
    };
    TitleEdit {
        cast: Some(cast.iter().map(actor).collect()),
        directors: Some(directors.iter().map(ToString::to_string).collect()),
        ..Default::default()
    }
}

fn library() -> TempPool {
    let pool = temp_pool("people");
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
         VALUES ('m1','movie','Dune','mkv','lib','t',?1)",
        params![provider(&["Timothée Chalamet"], &["Denis Villeneuve"])],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','S','t',?1)",
        params![provider(&["Adam Scott"], &[])],
    )
    .unwrap();
    drop(conn);
    pool
}

fn wrote(pool: &Pool, (kind, id): (&str, &str), edit: &TitleEdit) {
    title_edits::write(pool, Title { kind, id }, edit).unwrap();
}

fn jane() -> Found {
    Found {
        tmdb_id: Some(42),
        profile_url: Some("/api/images/jane.webp".into()),
        profile_source: Some("https://image.tmdb.org/t/p/w342/jane.jpg".into()),
    }
}

#[test]
fn only_the_names_written_that_the_provider_credits_nobody_under_are_searched() {
    let pool = library();
    let film = written(
        &["timothée chalamet", "Jane Doe"],
        &["Denis Villeneuve", "John Roe"],
    );
    wrote(&pool, (ITEM, "m1"), &film);
    wrote(
        &pool,
        (SHOW, "s1"),
        &written(&["Adam Scott", "Jane Doe"], &[]),
    );

    let names = unsearched(&pool, 0).unwrap();

    assert_eq!(names, ["Jane Doe", "John Roe"]);
}

#[test]
fn a_person_found_is_never_searched_again_and_a_miss_only_once_it_is_old() {
    let pool = library();
    wrote(&pool, (ITEM, "m1"), &written(&["Jane Doe"], &["John Roe"]));
    keep(&pool, "Jane Doe", &jane()).unwrap();
    keep(&pool, "John Roe", &Found::default()).unwrap();

    let recent = unsearched(&pool, 0).unwrap();
    let old = unsearched(&pool, i64::MAX).unwrap();

    assert!(recent.is_empty());
    assert_eq!(old, ["John Roe"]);
}

#[test]
fn a_written_person_tmdb_found_shows_the_id_and_the_portrait_it_found() {
    let pool = library();
    wrote(&pool, (ITEM, "m1"), &written(&["Jane Doe"], &["John Roe"]));
    keep(&pool, "Jane Doe", &jane()).unwrap();
    keep(&pool, "John Roe", &Found::default()).unwrap();
    let mut films = crate::get_items_by_ids(&pool, &["m1".to_string()]).unwrap();

    crate::localize::overlay_items(&pool, &mut films, "en").unwrap();

    let meta = films[0].metadata.as_ref().unwrap();
    assert_eq!(meta.cast[0].tmdb_id, Some(42));
    assert_eq!(
        meta.cast[0].profile_url.as_deref(),
        Some("/api/images/jane.webp")
    );
    assert_eq!(meta.crew[0].name, "John Roe");
    assert_eq!(meta.crew[0].tmdb_id, None);
}

#[test]
fn a_person_the_provider_credits_keeps_the_provider_s_id_and_portrait() {
    let pool = library();
    wrote(&pool, (ITEM, "m1"), &written(&["Timothée Chalamet"], &[]));
    keep(&pool, "Timothée Chalamet", &jane()).unwrap();
    let mut films = crate::get_items_by_ids(&pool, &["m1".to_string()]).unwrap();

    crate::localize::overlay_items(&pool, &mut films, "en").unwrap();

    let meta = films[0].metadata.as_ref().unwrap();
    assert_eq!(meta.cast[0].tmdb_id, Some(8));
    assert_eq!(meta.cast[0].profile_url, None);
}

#[test]
fn a_cached_portrait_names_the_address_it_was_cached_from() {
    let pool = library();
    keep(&pool, "Jane Doe", &jane()).unwrap();

    let source = source_of(&pool, "/api/images/jane.webp").unwrap();
    let unknown = source_of(&pool, "/api/images/other.webp").unwrap();

    assert_eq!(source, jane().profile_source);
    assert_eq!(unknown, None);
}
