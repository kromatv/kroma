use serde_json::json;

use super::*;

use crate::dialect::JELLYFIN;
use crate::test_support::{fixture, Recorded, World, ANA, LEO, OLD, SAM, SERVER};

const HEAT: &str = "c0000000000000000000000000000001";
const ALIEN: &str = "c0000000000000000000000000000002";

fn ana_watched() -> Recorded {
    let played = [("userId", ANA), ("filters", PLAYED)];
    let started = [("userId", ANA), ("filters", STARTED)];
    Recorded::jellyfin()
        .on(
            JELLYFIN.items.path,
            &played,
            fixture(include_str!("../fixtures/ana-played.json")),
        )
        .on(
            JELLYFIN.items.path,
            &started,
            fixture(include_str!("../fixtures/ana-started.json")),
        )
}

fn from(world: &World, cursor: Option<&str>) -> PlaysAsk {
    PlaysAsk {
        sign_in: world.signed_in(),
        server: SERVER.to_string(),
        cursor: cursor.map(str::to_string),
        changed_since: None,
        limit: Some(500),
    }
}

fn from_place(cursor: &str) -> PlaysAsk {
    PlaysAsk {
        server: SERVER.to_string(),
        cursor: Some(cursor.to_string()),
        limit: Some(500),
        ..PlaysAsk::default()
    }
}

fn walked(world: &World) -> (Vec<Play>, Vec<String>) {
    let mut ask = from(world, None);
    let (mut plays, mut cursors) = (Vec::new(), Vec::new());
    loop {
        let page = world.importer.plays(&ask).unwrap();
        plays.extend(page.plays);
        let Some(next) = page.next else {
            return (plays, cursors);
        };
        cursors.push(next.clone());
        ask.cursor = Some(next);
    }
}

#[test]
fn every_user_is_walked_in_id_order_first_what_they_watched_then_what_they_started() {
    let world = World::over(ana_watched());

    let (_, cursors) = walked(&world);

    let expected: Vec<String> = [SAM, ANA, LEO, OLD]
        .into_iter()
        .flat_map(|user| [format!("{user}/played/0"), format!("{user}/started/0")])
        .skip(1)
        .collect();
    assert_eq!(cursors, expected);
}

#[test]
fn a_watched_film_is_one_play_at_the_time_it_was_last_played() {
    let world = World::over(ana_watched());

    let (plays, _) = walked(&world);

    assert_eq!(
        plays[0],
        Play {
            id: format!("{ANA}:{HEAT}:1700000000"),
            user: ANA.to_string(),
            title: HEAT.to_string(),
            played_at: 1_700_000_000,
        }
    );
}

#[test]
fn a_film_stopped_part_way_is_a_play_too_and_one_with_no_date_is_none() {
    let world = World::over(ana_watched());

    let (plays, _) = walked(&world);

    let titles: Vec<&str> = plays.iter().map(|play| play.title.as_str()).collect();
    assert_eq!(titles, vec![HEAT, ALIEN]);
}

#[test]
fn a_play_keeps_its_id_from_one_listing_to_the_next() {
    let world = World::over(ana_watched());

    let (first, _) = walked(&world);
    let (second, _) = walked(&world);

    assert_eq!(first, second);
}

#[test]
fn only_the_plays_at_or_after_the_time_asked_come_back() {
    let world = World::over(ana_watched());
    let since_alien = PlaysAsk {
        changed_since: Some(1_700_086_400),
        ..from(&world, Some(&format!("{ANA}/started/0")))
    };
    let since_later = PlaysAsk {
        changed_since: Some(1_700_086_401),
        sign_in: since_alien.sign_in.clone(),
        ..from_place(&format!("{ANA}/started/0"))
    };

    let at = world.importer.plays(&since_alien).unwrap();
    let after = world.importer.plays(&since_later).unwrap();

    assert_eq!(at.plays.len(), 1);
    assert!(after.plays.is_empty());
    assert_eq!(after.next, Some(format!("{LEO}/played/0")));
}

#[test]
fn a_full_page_continues_in_the_same_user_and_pass() {
    let world = World::over(ana_watched());
    let two_at_a_time = PlaysAsk {
        limit: Some(2),
        ..from(&world, Some(&format!("{ANA}/played/4")))
    };

    let page = world.importer.plays(&two_at_a_time).unwrap();

    let start = world
        .jellyfin
        .seen(|seen| seen.last().unwrap().param("startIndex").map(str::to_string));
    assert_eq!(page.next, Some(format!("{ANA}/played/6")));
    assert_eq!(start.as_deref(), Some("4"));
}

#[test]
fn the_listing_goes_on_after_a_user_who_is_no_longer_there() {
    let world = World::over(ana_watched());
    let gone = "a0000000000000000000000000000002f";

    let page = world
        .importer
        .plays(&from(&world, Some(&format!("{gone}/started/0"))))
        .unwrap();

    assert_eq!(page.next, Some(format!("{LEO}/played/0")));
}

#[test]
fn a_server_with_no_user_has_no_play() {
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.users.path, &[], json!([])));

    let page = world.importer.plays(&from(&world, None)).unwrap();

    assert_eq!(page, PlayPage::default());
}

#[test]
fn a_cursor_that_is_not_one_of_ours_is_refused() {
    let world = World::over(ana_watched());

    let failures: Vec<String> = ["500", "u/watched/0", "u/played/x"]
        .into_iter()
        .map(|cursor| {
            world
                .importer
                .plays(&from(&world, Some(cursor)))
                .unwrap_err()
                .to_string()
        })
        .collect();

    assert_eq!(failures, vec!["a cursor this importer did not give"; 3]);
}

#[test]
fn each_pass_asks_the_server_for_its_own_filter_with_the_user_s_data() {
    let world = World::over(ana_watched());

    walked(&world);

    let asked: Vec<(String, String)> = world.jellyfin.seen(|seen| {
        seen.iter()
            .filter(|call| call.param("userId") == Some(ANA))
            .filter_map(|call| {
                Some((
                    call.param("filters")?.to_string(),
                    call.param("enableUserData")?.to_string(),
                ))
            })
            .collect()
    });
    assert_eq!(
        asked,
        vec![
            ("IsPlayed".to_string(), "true".to_string()),
            ("IsResumable,IsUnplayed".to_string(), "true".to_string()),
        ]
    );
}
