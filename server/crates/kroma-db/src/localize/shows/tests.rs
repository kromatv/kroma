use super::*;
use crate::art_beside::{POSTER, STILL};
use crate::localize::overlay_section_items;
use crate::localize::test_support::*;
use crate::translations::TransData;

use kroma_domain::{CastMember, Kind, ListedEpisode, Season, SectionItem};

#[test]
fn overlay_shows_and_section_items() {
    let p = pool();
    translations::put(
        &p,
        metadata_core::SHOW,
        "s1",
        "fr",
        translations::TMDB,
        &td("Serie FR", vec![]),
    )
    .unwrap();
    translations::put(
        &p,
        metadata_core::ITEM,
        "m1",
        "fr",
        translations::TMDB,
        &td("Film FR", vec![]),
    )
    .unwrap();

    let mut shows = vec![show("s1")];
    overlay_shows(&p, &mut shows, "fr").unwrap();
    assert_eq!(
        shows[0].metadata.as_ref().unwrap().title.as_deref(),
        Some("Serie FR")
    );

    let mut section = vec![
        SectionItem::Movie {
            item: Box::new(item("m1", Kind::Movie)),
        },
        SectionItem::Show {
            show: Box::new(show("s1")),
        },
    ];
    overlay_section_items(&p, &mut section, "fr").unwrap();
    match &section[0] {
        SectionItem::Movie { item } => assert_eq!(
            item.metadata.as_ref().unwrap().title.as_deref(),
            Some("Film FR")
        ),
        _ => panic!("expected movie"),
    }
    match &section[1] {
        SectionItem::Show { show } => assert_eq!(
            show.metadata.as_ref().unwrap().title.as_deref(),
            Some("Serie FR")
        ),
        _ => panic!("expected show"),
    }
}

#[test]
fn overlay_show_detail_covers_show_episodes_and_season_cast() {
    let p = pool();
    translations::put(
        &p,
        metadata_core::SHOW,
        "s1",
        "fr",
        translations::TMDB,
        &td("Serie FR", vec![]),
    )
    .unwrap();
    translations::put(
        &p,
        "episode_guide",
        "s1:1:2",
        "fr",
        translations::TMDB,
        &td("Listé FR", vec![]),
    )
    .unwrap();
    translations::put(
        &p,
        "episode",
        "e1",
        "fr",
        translations::TMDB,
        &td("Ep FR", vec![]),
    )
    .unwrap();
    keep_beside(&p, &[(metadata_core::ITEM, "e1", STILL)]);
    translations::put(
        &p,
        "season_cast",
        "s1:1",
        "fr",
        translations::TMDB,
        &TransData {
            characters: vec![Some("Perso Saison".into())],
            ..Default::default()
        },
    )
    .unwrap();

    let mut detail = ShowDetail {
        show: show("s1"),
        seasons: vec![Season {
            number: 1,
            episodes: vec![item("e1", Kind::Episode)],
            poster_url: None,
            cast: vec![CastMember {
                name: "A".into(),
                tmdb_id: None,
                character: Some("orig".into()),
                profile_url: None,
            }],
            missing: vec![ListedEpisode {
                episode: 2,
                title: Some("Listed".into()),
                overview: Some("Original".into()),
                air_date: None,
                still_url: None,
            }],
        }],
    };
    overlay_show_detail(&p, &mut detail, "fr").unwrap();

    assert_eq!(
        detail.show.metadata.as_ref().unwrap().title.as_deref(),
        Some("Serie FR")
    );
    assert_eq!(
        detail.seasons[0].episodes[0]
            .metadata
            .as_ref()
            .unwrap()
            .title
            .as_deref(),
        Some("Ep FR")
    );
    assert_eq!(detail.seasons[0].episodes[0].title, "Ep FR");
    assert_eq!(
        detail.seasons[0].episodes[0]
            .metadata
            .as_ref()
            .unwrap()
            .backdrop_url
            .as_deref(),
        Some("/api/images/beside-e1-still.webp")
    );
    assert_eq!(
        detail.seasons[0].cast[0].character.as_deref(),
        Some("Perso Saison")
    );
    assert_eq!(
        detail.seasons[0].missing[0].title.as_deref(),
        Some("Listé FR")
    );
    assert_eq!(
        detail.seasons[0].missing[0].overview.as_deref(),
        Some("Original")
    );
}

fn two_seasons() -> ShowDetail {
    ShowDetail {
        show: show("s1"),
        seasons: vec![
            Season {
                number: 1,
                ..Season::default()
            },
            Season {
                number: 2,
                ..Season::default()
            },
        ],
    }
}

#[test]
fn a_season_wears_the_poster_kept_beside_its_folder() {
    let p = pool();
    keep_beside(&p, &[(SEASON, "s1:2", POSTER)]);
    let mut detail = two_seasons();

    overlay_show_detail(&p, &mut detail, "en").unwrap();

    assert_eq!(detail.seasons[0].poster_url, None);
    assert_eq!(
        detail.seasons[1].poster_url.as_deref(),
        Some("/api/images/beside-s1:2-poster.webp")
    );
}

#[test]
fn a_season_wears_the_fetched_poster_unless_one_is_kept_beside_its_folder() {
    let p = pool();
    for id in ["s1:1", "s1:2"] {
        let fetched = TransData {
            poster_url: Some(format!("/api/images/fetched-{id}.webp")),
            ..Default::default()
        };
        translations::put(&p, SEASON, id, "en", translations::TMDB, &fetched).unwrap();
    }
    keep_beside(&p, &[(SEASON, "s1:2", POSTER)]);
    let mut detail = two_seasons();

    overlay_show_detail(&p, &mut detail, "fr").unwrap();

    assert_eq!(
        detail.seasons[0].poster_url.as_deref(),
        Some("/api/images/fetched-s1:1.webp")
    );
    assert_eq!(
        detail.seasons[1].poster_url.as_deref(),
        Some("/api/images/beside-s1:2-poster.webp")
    );
}
