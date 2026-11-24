use kroma_domain::{Kind, SectionItem};

use crate::art_beside::{BACKDROP, POSTER};
use crate::art_chosen::{self, Slot};
use crate::localize::test_support::*;
use crate::localize::{
    overlay_each, overlay_items, overlay_section_items, overlay_show_metadata, overlay_shows,
};
use crate::metadata_core::{ITEM, SHOW};
use crate::translations;

#[test]
fn a_picture_beside_a_film_comes_before_its_fetched_art_in_every_language() {
    let p = pool();
    let mut fetched = td("Arrival", vec![]);
    fetched.poster_url = Some("/api/images/fetched-en.webp".into());
    translations::put(&p, ITEM, "m1", "en", translations::TMDB, &fetched).unwrap();
    keep_beside(&p, &[(ITEM, "m1", POSTER), (ITEM, "m1", BACKDROP)]);
    let mut items = vec![item("m1", Kind::Movie)];

    overlay_items(&p, &mut items, "en").unwrap();

    let meta = items[0].metadata.as_ref().unwrap();
    assert_eq!(items[0].title, "Arrival");
    assert_eq!(
        meta.poster_url.as_deref(),
        Some("/api/images/beside-m1-poster.webp")
    );
    assert_eq!(
        meta.backdrop_url.as_deref(),
        Some("/api/images/beside-m1-backdrop.webp")
    );
}

#[test]
fn an_episode_wears_the_poster_beside_its_show_and_keeps_its_still() {
    let p = pool();
    keep_beside(&p, &[(SHOW, "sh1", POSTER), (SHOW, "sh1", BACKDROP)]);
    let mut episode = item("e1", Kind::Episode);
    episode.show_id = Some("sh1".into());
    episode.metadata.as_mut().unwrap().backdrop_url = Some("/api/images/still.webp".into());

    overlay_each(&p, std::iter::once(&mut episode), "en").unwrap();

    let meta = episode.metadata.as_ref().unwrap();
    assert_eq!(
        meta.poster_url.as_deref(),
        Some("/api/images/beside-sh1-poster.webp")
    );
    assert_eq!(meta.backdrop_url.as_deref(), Some("/api/images/still.webp"));
}

#[test]
fn a_title_that_was_never_matched_gets_no_made_up_metadata() {
    let p = pool();
    keep_beside(&p, &[(ITEM, "m1", POSTER)]);
    let mut film = item("m1", Kind::Movie);
    film.metadata = None;

    overlay_each(&p, std::iter::once(&mut film), "en").unwrap();

    assert!(film.metadata.is_none());
}

#[test]
fn a_show_wears_the_pictures_beside_its_files_wherever_it_is_listed() {
    let p = pool();
    keep_beside(&p, &[(SHOW, "s1", POSTER)]);
    let mut shows = vec![show("s1")];
    let mut rows = vec![SectionItem::Show {
        show: Box::new(show("s1")),
    }];
    let mut blob = meta("Show EN");

    overlay_shows(&p, &mut shows, "fr").unwrap();
    overlay_section_items(&p, &mut rows, "fr").unwrap();
    overlay_show_metadata(&p, "s1", &mut blob, "fr").unwrap();

    let SectionItem::Show { show: row } = &rows[0] else {
        panic!("expected a show row");
    };
    let beside = Some("/api/images/beside-s1-poster.webp");
    assert_eq!(
        shows[0].metadata.as_ref().unwrap().poster_url.as_deref(),
        beside
    );
    assert_eq!(row.metadata.as_ref().unwrap().poster_url.as_deref(), beside);
    assert_eq!(blob.poster_url.as_deref(), beside);
}

#[test]
fn a_backdrop_an_admin_chose_comes_before_the_one_beside_the_files() {
    let p = pool();
    keep_beside(&p, &[(ITEM, "m1", POSTER), (ITEM, "m1", BACKDROP)]);
    let backdrop = Slot {
        kind: ITEM,
        id: "m1",
        role: BACKDROP,
    };
    art_chosen::choose(&p, backdrop, "/api/images/chosen-m1.webp").unwrap();
    let mut items = vec![item("m1", Kind::Movie)];

    overlay_items(&p, &mut items, "en").unwrap();

    let meta = items[0].metadata.as_ref().unwrap();
    assert_eq!(
        meta.poster_url.as_deref(),
        Some("/api/images/beside-m1-poster.webp")
    );
    assert_eq!(
        meta.backdrop_url.as_deref(),
        Some("/api/images/chosen-m1.webp")
    );
}
