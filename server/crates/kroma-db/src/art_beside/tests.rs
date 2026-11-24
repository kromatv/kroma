use std::collections::HashSet;

use super::*;
use crate::metadata_core::{ITEM, SHOW};
use crate::testing::{temp_pool, TempPool};

fn picture(id: &str, library: &str, role: &'static str) -> Picture {
    Picture {
        subject_kind: ITEM,
        subject_id: id.into(),
        library: library.into(),
        role,
        path: format!("/media/{id}-{role}.jpg"),
        url: format!("/api/images/beside-{id}-{role}.webp"),
    }
}

fn kept(libraries: &[&str]) -> HashSet<String> {
    libraries.iter().map(|l| (*l).to_string()).collect()
}

fn pool_with(pictures: &[Picture]) -> TempPool {
    let pool = temp_pool("art-beside");
    replace(&pool, pictures, &kept(&[])).unwrap();
    pool
}

#[test]
fn a_scan_replaces_the_pictures_an_earlier_one_found() {
    let pool = pool_with(&[
        picture("m1", "films", POSTER),
        picture("m2", "films", POSTER),
    ]);

    replace(&pool, &[picture("m2", "films", BACKDROP)], &kept(&[])).unwrap();

    assert_eq!(poster_of(&pool, ITEM, "m1").unwrap(), None);
    assert_eq!(poster_of(&pool, ITEM, "m2").unwrap(), None);
    assert!(source_of(&pool, "/api/images/beside-m2-backdrop.webp")
        .unwrap()
        .is_some());
}

#[test]
fn a_library_the_scan_could_not_read_keeps_its_pictures() {
    let pool = pool_with(&[
        picture("m1", "films", POSTER),
        picture("s1", "away", POSTER),
    ]);

    replace(&pool, &[], &kept(&["away"])).unwrap();

    assert_eq!(poster_of(&pool, ITEM, "m1").unwrap(), None);
    assert_eq!(
        poster_of(&pool, ITEM, "s1").unwrap().as_deref(),
        Some("/api/images/beside-s1-poster.webp")
    );
}

#[test]
fn a_served_url_leads_back_to_its_picture_and_role() {
    let pool = pool_with(&[picture("m1", "films", BACKDROP)]);

    let source = source_of(&pool, "/api/images/beside-m1-backdrop.webp").unwrap();
    let unknown = source_of(&pool, "/api/images/beside-other.webp").unwrap();

    assert_eq!(
        source,
        Some(Source {
            path: "/media/m1-backdrop.jpg".into(),
            role: BACKDROP.into(),
        })
    );
    assert_eq!(unknown, None);
}

#[test]
fn a_picture_that_could_not_be_read_is_passed_over() {
    let pool = pool_with(&[picture("m1", "films", POSTER)]);

    let gone = forget(&pool, "/api/images/beside-m1-poster.webp").unwrap();

    assert_eq!(gone, 1);
    assert_eq!(poster_of(&pool, ITEM, "m1").unwrap(), None);
}

#[test]
fn a_poster_belongs_to_one_kind_of_title() {
    let pool = pool_with(&[picture("x1", "films", POSTER)]);

    let as_item = poster_of(&pool, ITEM, "x1").unwrap();
    let as_show = poster_of(&pool, SHOW, "x1").unwrap();

    assert!(as_item.is_some());
    assert_eq!(as_show, None);
}
