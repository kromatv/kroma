use kroma_domain::title_edit::TitleEdit;
use kroma_domain::{Kind, SectionItem};

use crate::art_beside::{BACKDROP, LOGO, POSTER, STILL};
use crate::art_chosen::{self, Slot};
use crate::localize::test_support::*;
use crate::localize::{
    overlay_each, overlay_items, overlay_section_items, overlay_show_metadata, overlay_shows,
};
use crate::metadata_core::{ITEM, SHOW};
use crate::title_edits::{self, Title};
use crate::translations;

#[test]
fn a_picture_beside_a_film_comes_before_its_fetched_art_in_every_language() {
    let p = pool();
    let mut fetched = td("Arrival", vec![]);
    fetched.poster_url = Some("/api/images/fetched-en.webp".into());
    translations::put(&p, ITEM, "m1", "en", translations::TMDB, &fetched).unwrap();
    keep_beside(
        &p,
        &[
            (ITEM, "m1", POSTER),
            (ITEM, "m1", BACKDROP),
            (ITEM, "m1", LOGO),
        ],
    );
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
    assert_eq!(
        meta.logo_url.as_deref(),
        Some("/api/images/beside-m1-logo.webp")
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
fn an_episode_s_thumbnail_comes_before_its_fetched_still_or_stands_alone() {
    let p = pool();
    keep_beside(&p, &[(ITEM, "e1", STILL), (ITEM, "e2", STILL)]);
    let mut fetched = item("e1", Kind::Episode);
    fetched.metadata.as_mut().unwrap().backdrop_url = Some("/api/images/still.webp".into());
    let mut never_matched = item("e2", Kind::Episode);
    never_matched.metadata = None;

    overlay_each(&p, [&mut fetched, &mut never_matched], "en").unwrap();

    let still = |episode: &kroma_domain::MediaItem| {
        episode
            .metadata
            .as_ref()
            .and_then(|meta| meta.backdrop_url.clone())
    };
    assert_eq!(
        still(&fetched).as_deref(),
        Some("/api/images/beside-e1-still.webp")
    );
    assert_eq!(
        still(&never_matched).as_deref(),
        Some("/api/images/beside-e2-still.webp")
    );
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

fn edit(title: &str) -> TitleEdit {
    TitleEdit {
        title: Some(title.into()),
        genres: Some(vec!["Family".into()]),
        ..Default::default()
    }
}

#[test]
fn a_name_written_by_hand_comes_before_the_provider_one_in_every_language() {
    let p = pool();
    translations::put(
        &p,
        ITEM,
        "m1",
        "en",
        translations::TMDB,
        &td("Arrival", vec![]),
    )
    .unwrap();
    translations::put(
        &p,
        ITEM,
        "m1",
        "fr",
        translations::TMDB,
        &td("Premier contact", vec![]),
    )
    .unwrap();
    title_edits::write(
        &p,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &edit("Our first contact"),
    )
    .unwrap();
    let mut en = vec![item("m1", Kind::Movie)];
    let mut fr = vec![item("m1", Kind::Movie)];

    overlay_items(&p, &mut en, "en").unwrap();
    overlay_items(&p, &mut fr, "fr").unwrap();

    for film in [&en[0], &fr[0]] {
        let meta = film.metadata.as_ref().unwrap();
        assert_eq!(film.title, "Our first contact");
        assert_eq!(meta.title.as_deref(), Some("Our first contact"));
        assert_eq!(meta.genres, vec!["Family".to_string()]);
    }
}

#[test]
fn an_episode_named_by_its_file_wears_the_name_written_for_it() {
    let p = pool();
    translations::put(
        &p,
        "episode",
        "e1",
        "en",
        translations::TMDB,
        &td("Pilot", vec![]),
    )
    .unwrap();
    let written = Title {
        kind: ITEM,
        id: "e1",
    };
    title_edits::write(&p, written, &edit("Kassa")).unwrap();
    let mut episode = item("e1", Kind::Episode);
    episode.episode_title = Some("From the file".into());

    overlay_each(&p, [&mut episode], "en").unwrap();

    assert_eq!(episode.title, "Kassa");
    assert_eq!(episode.episode_title.as_deref(), Some("Kassa"));
}

#[test]
fn a_summary_written_for_a_film_never_matched_shows_the_poster_beside_it() {
    let p = pool();
    keep_beside(&p, &[(ITEM, "m1", POSTER)]);
    let summary = TitleEdit {
        overview: Some("Found in the attic.".into()),
        ..Default::default()
    };
    title_edits::write(
        &p,
        Title {
            kind: ITEM,
            id: "m1",
        },
        &summary,
    )
    .unwrap();
    let mut film = item("m1", Kind::Movie);
    film.metadata = None;

    overlay_each(&p, std::iter::once(&mut film), "en").unwrap();

    let meta = film.metadata.expect("a record for the summary");
    assert_eq!(meta.overview.as_deref(), Some("Found in the attic."));
    assert_eq!(
        meta.poster_url.as_deref(),
        Some("/api/images/beside-m1-poster.webp")
    );
}

#[test]
fn a_show_wears_its_edited_name_on_its_page_its_poster_and_its_episodes() {
    let p = pool();
    title_edits::write(
        &p,
        Title {
            kind: SHOW,
            id: "s1",
        },
        &edit("Our show"),
    )
    .unwrap();
    let mut shows = vec![show("s1")];
    let mut blob = meta("Show EN");
    let mut episode = item("e1", Kind::Episode);
    episode.show_id = Some("s1".into());

    overlay_shows(&p, &mut shows, "fr").unwrap();
    overlay_show_metadata(&p, "s1", &mut blob, "fr").unwrap();
    overlay_each(&p, std::iter::once(&mut episode), "fr").unwrap();

    assert_eq!(shows[0].title, "Our show");
    assert_eq!(blob.title.as_deref(), Some("Our show"));
    assert_eq!(blob.genres, vec!["Family".to_string()]);
    assert_eq!(episode.show_title.as_deref(), Some("Our show"));
}
