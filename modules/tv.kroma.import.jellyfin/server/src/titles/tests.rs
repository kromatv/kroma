use serde_json::json;

use super::*;

use crate::dialect::JELLYFIN;
use crate::test_support::{fixture, Recorded, World, FILMS, SAM, SERVER, SHOWS};

const HEAT: &str = "c0000000000000000000000000000001";
const ALIEN: &str = "c0000000000000000000000000000002";
const THE_WIRE: &str = "e0000000000000000000000000000001";

fn library_of(library: &str) -> TitlesAsk {
    TitlesAsk {
        server: SERVER.to_string(),
        library: library.to_string(),
        limit: Some(500),
        ..TitlesAsk::default()
    }
}

fn library(world: &World, library: &str) -> TitlesAsk {
    TitlesAsk {
        sign_in: world.signed_in(),
        ..library_of(library)
    }
}

fn films() -> Recorded {
    Recorded::jellyfin()
        .on(
            JELLYFIN.items.path,
            &[("parentId", FILMS)],
            fixture(include_str!("../fixtures/films-page.json")),
        )
        .on(
            JELLYFIN.items.path,
            &[("ids", ALIEN)],
            fixture(include_str!("../fixtures/alien-versions.json")),
        )
}

fn shows() -> Recorded {
    Recorded::jellyfin()
        .on(
            JELLYFIN.items.path,
            &[("parentId", SHOWS)],
            fixture(include_str!("../fixtures/shows-page.json")),
        )
        .on(
            JELLYFIN.items.path,
            &[("ids", THE_WIRE)],
            fixture(include_str!("../fixtures/the-wire.json")),
        )
}

#[test]
fn a_film_comes_with_its_file_its_year_and_its_ids() {
    let world = World::over(films());

    let page = world.importer.titles(&library(&world, FILMS)).unwrap();

    assert_eq!(
        page.titles[0],
        Title {
            id: HEAT.to_string(),
            kind: TitleKind::Movie,
            paths: vec!["/data/movies/Heat (1995)/Heat (1995).mkv".to_string()],
            title: Some("Heat".to_string()),
            year: Some(1995),
            ids: ExternalIds {
                tmdb: Some("949".to_string()),
                imdb: Some("tt0113277".to_string()),
                tvdb: None,
            },
            series: None,
            season: None,
            episode: None,
        }
    );
}

#[test]
fn a_film_kept_in_two_versions_has_the_file_of_each() {
    let world = World::over(films());

    let page = world.importer.titles(&library(&world, FILMS)).unwrap();

    assert_eq!(
        page.titles[1].paths,
        vec![
            "/data/movies/Alien (1979)/Alien (1979) - 1080p.mkv",
            "/data/movies/Alien (1979)/Alien (1979) - 2160p.mkv",
        ]
    );
}

#[test]
fn the_versions_are_asked_only_for_the_films_that_have_more_than_one() {
    let world = World::over(films());

    world.importer.titles(&library(&world, FILMS)).unwrap();

    let lookups: Vec<(String, String)> = world.jellyfin.seen(|seen| {
        seen.iter()
            .filter_map(|call| {
                Some((
                    call.param("ids")?.to_string(),
                    call.param("fields")?.to_string(),
                ))
            })
            .collect()
    });
    assert_eq!(
        lookups,
        vec![(ALIEN.to_string(), "MediaSources".to_string())]
    );
}

#[test]
fn an_episode_comes_with_its_numbers_and_the_show_it_belongs_to() {
    let world = World::over(shows());

    let page = world.importer.titles(&library(&world, SHOWS)).unwrap();

    let episode = &page.titles[0];
    assert_eq!(episode.kind, TitleKind::Episode);
    assert_eq!(episode.title.as_deref(), Some("The Buys"));
    assert_eq!((episode.season, episode.episode), (Some(1), Some(3)));
    assert_eq!(episode.ids.tvdb.as_deref(), Some("127396"));
    assert_eq!(
        episode.series,
        Some(Series {
            title: Some("The Wire".to_string()),
            year: Some(2002),
            ids: ExternalIds {
                tmdb: Some("1438".to_string()),
                imdb: Some("tt0306414".to_string()),
                tvdb: Some("79126".to_string()),
            },
        })
    );
}

#[test]
fn the_show_of_a_page_of_episodes_is_asked_once() {
    let world = World::over(shows());

    world.importer.titles(&library(&world, SHOWS)).unwrap();

    let asked: Vec<String> = world.jellyfin.seen(|seen| {
        seen.iter()
            .filter_map(|call| call.param("ids").map(str::to_string))
            .collect()
    });
    assert_eq!(asked, vec![THE_WIRE]);
}

#[test]
fn an_episode_whose_show_the_server_does_not_give_keeps_the_show_s_name() {
    let unknown = [("ids", THE_WIRE)];
    let world = World::over(shows().on(JELLYFIN.items.path, &unknown, json!({ "Items": [] })));

    let page = world.importer.titles(&library(&world, SHOWS)).unwrap();

    assert_eq!(
        page.titles[1].series,
        Some(Series {
            title: Some("The Wire".to_string()),
            year: None,
            ids: ExternalIds::default(),
        })
    );
}

#[test]
fn a_page_asks_for_films_and_episodes_below_the_library_as_the_signed_in_user() {
    let world = World::over(films());

    world.importer.titles(&library(&world, FILMS)).unwrap();

    let query = world.jellyfin.seen(|seen| seen[2].query.clone());
    let sent: Vec<(&str, &str)> = query
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    assert_eq!(
        sent,
        vec![
            ("userId", SAM),
            ("recursive", "true"),
            ("includeItemTypes", "Movie,Episode"),
            ("enableImages", "false"),
            ("parentId", FILMS),
            ("fields", "Path,ProviderIds,MediaSourceCount"),
            ("enableUserData", "false"),
            ("sortBy", "DateCreated,SortName"),
            ("sortOrder", "Ascending"),
            ("startIndex", "0"),
            ("limit", "500"),
            ("enableTotalRecordCount", "false"),
        ]
    );
}

#[test]
fn a_full_page_gives_the_cursor_of_the_next_and_a_short_one_gives_none() {
    let world = World::over(films());
    let two_at_a_time = TitlesAsk {
        limit: Some(2),
        ..library(&world, FILMS)
    };
    let then_three = TitlesAsk {
        cursor: Some("2".to_string()),
        limit: Some(3),
        sign_in: two_at_a_time.sign_in.clone(),
        ..library_of(FILMS)
    };

    let full = world.importer.titles(&two_at_a_time).unwrap();
    let short = world.importer.titles(&then_three).unwrap();

    let starts: Vec<String> = world.jellyfin.seen(|seen| {
        seen.iter()
            .filter_map(|call| call.param("startIndex").map(str::to_string))
            .collect()
    });
    assert_eq!(full.next.as_deref(), Some("2"));
    assert_eq!(short.next, None);
    assert_eq!(starts, vec!["0", "2"]);
}

#[test]
fn a_title_of_another_kind_is_said_to_be_one() {
    let odd = json!({ "Items": [{ "Id": "x1", "Type": "MusicVideo", "IndexNumber": 4, "Path": "/data/clip.mkv" }] });
    let world =
        World::over(Recorded::jellyfin().on(JELLYFIN.items.path, &[("parentId", FILMS)], odd));

    let page = world.importer.titles(&library(&world, FILMS)).unwrap();

    assert_eq!(page.titles[0].kind, TitleKind::Other);
    assert_eq!(page.titles[0].episode, None);
}

#[test]
fn a_library_the_signed_in_account_may_not_open_fails_and_says_so() {
    let hidden = (401, json!(null));
    let world = World::over(Recorded::jellyfin().answering(
        JELLYFIN.items.path,
        &[("parentId", FILMS)],
        hidden,
    ));

    let failure = world.importer.titles(&library(&world, FILMS)).unwrap_err();

    assert_eq!(
        failure.to_string(),
        "the Jellyfin account that signed in may not open this library"
    );
}

#[test]
fn an_answer_past_the_size_a_page_may_have_is_not_read() {
    let many: Vec<serde_json::Value> = (0..40_000)
        .map(|n| json!({ "Id": format!("id{n}"), "Type": "Movie", "Path": "x".repeat(400) }))
        .collect();
    let world = World::over(Recorded::jellyfin().on(
        JELLYFIN.items.path,
        &[("parentId", FILMS)],
        json!({ "Items": many }),
    ));

    let failure = world.importer.titles(&library(&world, FILMS)).unwrap_err();

    assert_eq!(
        failure.to_string(),
        "Jellyfin gave an answer to /Items this importer cannot read"
    );
}
