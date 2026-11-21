use serde_json::json;

use super::*;

use crate::dialect::JELLYFIN;
use crate::test_support::{fixture, Recorded, World, ANA, FILMS, SERVER, SHOWS};

const HEAT: &str = "c0000000000000000000000000000001";
const ALIEN: &str = "c0000000000000000000000000000002";

fn of_ana(world: &World) -> StatesAsk {
    StatesAsk {
        sign_in: world.signed_in(),
        server: SERVER.to_string(),
        user: ANA.to_string(),
        library: FILMS.to_string(),
        cursor: None,
        limit: Some(500),
    }
}

fn ana_s_films() -> Recorded {
    let hers = [("userId", ANA), ("parentId", FILMS)];
    Recorded::jellyfin().on(
        JELLYFIN.items.path,
        &hers,
        fixture(include_str!("../fixtures/ana-films.json")),
    )
}

#[test]
fn a_watched_film_comes_with_its_count_its_date_and_its_favourite_mark() {
    let world = World::over(ana_s_films());

    let page = world.importer.states(&of_ana(&world)).unwrap();

    assert_eq!(
        page.states[0],
        WatchState {
            title: HEAT.to_string(),
            watched: true,
            play_count: Some(3),
            position_ms: None,
            duration_ms: Some(10_200_000),
            last_played_at: Some(1_700_000_000),
            favourite: true,
        }
    );
}

#[test]
fn a_film_stopped_part_way_comes_with_the_place_in_milliseconds() {
    let world = World::over(ana_s_films());

    let page = world.importer.states(&of_ana(&world)).unwrap();

    assert_eq!(
        page.states[1],
        WatchState {
            title: ALIEN.to_string(),
            watched: false,
            play_count: Some(1),
            position_ms: Some(1_234_000),
            duration_ms: Some(7_020_000),
            last_played_at: Some(1_700_086_400),
            favourite: false,
        }
    );
}

#[test]
fn a_film_the_user_never_touched_has_no_state() {
    let world = World::over(ana_s_films());

    let page = world.importer.states(&of_ana(&world)).unwrap();

    assert_eq!(page.states.len(), 2);
    assert_eq!(page.next, None);
}

#[test]
fn the_state_is_asked_for_that_user_in_that_library() {
    let world = World::over(ana_s_films());

    world.importer.states(&of_ana(&world)).unwrap();

    let asked = world.jellyfin.seen(|seen| {
        let call = seen.last().unwrap();
        ["userId", "parentId", "enableUserData", "includeItemTypes"]
            .map(|name| call.param(name).map(str::to_string))
    });
    assert_eq!(
        asked,
        [ANA, FILMS, "true", "Movie,Episode,Series"].map(|value| Some(value.to_string()))
    );
}

#[test]
fn a_page_with_no_state_in_it_still_names_the_next_page() {
    let untouched =
        json!({ "Items": [{ "Id": "c1", "Type": "Movie", "UserData": { "PlayCount": 0 } }] });
    let world =
        World::over(Recorded::jellyfin().on(JELLYFIN.items.path, &[("userId", ANA)], untouched));
    let one_at_a_time = StatesAsk {
        limit: Some(1),
        cursor: Some("7".to_string()),
        ..of_ana(&world)
    };

    let page = world.importer.states(&one_at_a_time).unwrap();

    assert!(page.states.is_empty());
    assert_eq!(page.next.as_deref(), Some("8"));
}

#[test]
fn a_library_the_user_may_not_see_holds_no_state_for_them() {
    let hidden = (401, json!(null));
    let world = World::over(Recorded::jellyfin().answering(
        JELLYFIN.items.path,
        &[("userId", ANA)],
        hidden,
    ));

    let page = world.importer.states(&of_ana(&world)).unwrap();

    assert_eq!(page, StatePage::default());
    assert_eq!(
        world.jellyfin.paths().last().map(String::as_str),
        Some("/Users/Me")
    );
}

#[test]
fn a_refusal_from_a_server_that_took_the_sign_in_back_is_a_failure() {
    let world = World::over(ana_s_films());
    let ask = of_ana(&world);
    world.jellyfin.revoke();

    let failure = world.importer.states(&ask).unwrap_err();

    assert_eq!(
        failure.to_string(),
        "Jellyfin refused the sign-in it gave. Sign in again."
    );
}

#[test]
fn a_date_the_server_writes_badly_leaves_the_state_without_one() {
    let odd = json!({ "Items": [{ "Id": "c1", "Type": "Movie", "RunTimeTicks": -5,
        "UserData": { "Played": true, "PlayCount": -1, "PlaybackPositionTicks": -9, "LastPlayedDate": "soon" } }] });
    let world = World::over(Recorded::jellyfin().on(JELLYFIN.items.path, &[("userId", ANA)], odd));

    let page = world.importer.states(&of_ana(&world)).unwrap();

    assert_eq!(
        page.states,
        vec![WatchState {
            title: "c1".to_string(),
            watched: true,
            play_count: None,
            position_ms: None,
            duration_ms: None,
            last_played_at: None,
            favourite: false,
        }]
    );
}

#[test]
fn a_favourite_on_a_whole_show_comes_with_the_show_s_id() {
    let hers = [("userId", ANA), ("parentId", SHOWS)];
    let shows = Recorded::jellyfin().on(
        JELLYFIN.items.path,
        &hers,
        fixture(include_str!("../fixtures/ana-shows.json")),
    );
    let world = World::over(shows);
    let ask = StatesAsk {
        library: SHOWS.to_string(),
        ..of_ana(&world)
    };

    let page = world.importer.states(&ask).unwrap();

    assert_eq!(
        page.states,
        vec![WatchState {
            title: "e0000000000000000000000000000001".to_string(),
            watched: false,
            play_count: None,
            position_ms: None,
            duration_ms: None,
            last_played_at: None,
            favourite: true,
        }]
    );
}
