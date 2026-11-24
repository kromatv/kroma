use std::collections::HashSet;

use super::*;
use crate::art_beside::{self, Picture, BACKDROP, POSTER};
use crate::metadata_core::{ITEM, SHOW};
use crate::testing::{temp_pool, TempPool};

fn slot<'a>(kind: &'a str, id: &'a str, role: &'a str) -> Slot<'a> {
    Slot { kind, id, role }
}

fn pool_with_a_poster_beside(id: &str) -> TempPool {
    let pool = temp_pool("art-chosen");
    let beside = Picture {
        subject_kind: ITEM,
        subject_id: id.into(),
        library: "films".into(),
        role: POSTER,
        path: format!("/media/{id}.jpg"),
        url: format!("/api/images/beside-{id}.webp"),
    };
    art_beside::replace(&pool, &[beside], &HashSet::new()).unwrap();
    pool
}

#[test]
fn a_chosen_poster_comes_before_the_one_beside_the_files() {
    let pool = pool_with_a_poster_beside("m1");

    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-a.webp").unwrap();

    assert_eq!(
        art_beside::poster_of(&pool, ITEM, "m1").unwrap().as_deref(),
        Some("/api/images/chosen-a.webp")
    );
}

#[test]
fn choosing_again_replaces_the_earlier_choice() {
    let pool = temp_pool("art-chosen");
    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-a.webp").unwrap();

    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-b.webp").unwrap();

    assert_eq!(
        chosen(&pool, ITEM, "m1").unwrap().poster.as_deref(),
        Some("/api/images/chosen-b.webp")
    );
}

#[test]
fn clearing_a_slot_hands_it_back_to_the_picture_beside_the_files() {
    let pool = pool_with_a_poster_beside("m1");
    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-a.webp").unwrap();

    clear(&pool, slot(ITEM, "m1", POSTER)).unwrap();

    assert_eq!(
        art_beside::poster_of(&pool, ITEM, "m1").unwrap().as_deref(),
        Some("/api/images/beside-m1.webp")
    );
}

#[test]
fn what_was_chosen_leaves_out_the_pictures_beside_the_files() {
    let pool = pool_with_a_poster_beside("m1");
    choose(
        &pool,
        slot(ITEM, "m1", BACKDROP),
        "/api/images/chosen-b.webp",
    )
    .unwrap();

    let urls = chosen(&pool, ITEM, "m1").unwrap();

    assert_eq!(
        urls,
        Urls {
            poster: None,
            backdrop: Some("/api/images/chosen-b.webp".into()),
        }
    );
}

#[test]
fn a_choice_belongs_to_one_kind_of_title() {
    let pool = temp_pool("art-chosen");

    choose(&pool, slot(SHOW, "x1", POSTER), "/api/images/chosen-a.webp").unwrap();

    assert_eq!(chosen(&pool, ITEM, "x1").unwrap(), Urls::default());
    assert!(chosen(&pool, SHOW, "x1").unwrap().poster.is_some());
}

#[test]
fn a_scan_leaves_what_an_admin_chose() {
    let pool = temp_pool("art-chosen");
    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-a.webp").unwrap();

    art_beside::replace(&pool, &[], &HashSet::new()).unwrap();

    assert!(chosen(&pool, ITEM, "m1").unwrap().poster.is_some());
}

#[test]
fn a_picture_chosen_for_two_titles_is_listed_once() {
    let pool = temp_pool("art-chosen");
    choose(&pool, slot(ITEM, "m1", POSTER), "/api/images/chosen-a.webp").unwrap();
    choose(&pool, slot(SHOW, "s1", POSTER), "/api/images/chosen-a.webp").unwrap();

    let conn = pool.get().unwrap();

    assert_eq!(
        urls(&conn).unwrap(),
        vec!["/api/images/chosen-a.webp".to_string()]
    );
}
