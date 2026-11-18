use serde_json::{json, Value};

use super::*;
use crate::test_support::{test_state, test_state_with_tmdb, FakeTmdb};

mod reading;

const NOW: i64 = 1_700_000_000_000;

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(ToString::to_string).collect()
}

fn hit(kind: RequestKind, tmdb_id: u64) -> DiscoverHit {
    DiscoverHit {
        kind,
        tmdb_id,
        title: format!("Title {tmdb_id}"),
        original_title: String::new(),
        year: Some(1999),
        poster_url: Some(format!("poster/{tmdb_id}")),
        backdrop_url: Some(format!("backdrop/{tmdb_id}")),
        overview: None,
        rating: Some(8.5),
    }
}

fn film(tmdb_id: u64) -> DiscoverHit {
    hit(RequestKind::Movie, tmdb_id)
}

fn show(tmdb_id: u64) -> DiscoverHit {
    hit(RequestKind::Show, tmdb_id)
}

fn splash(title: &str) -> SplashEntry {
    SplashEntry {
        kind: "movie".to_string(),
        title: title.to_string(),
        year: None,
        backdrop_url: format!("backdrop/{title}"),
        rating: None,
        poster_url: None,
        trending: false,
    }
}

fn titles(entries: &[SplashEntry]) -> Vec<&str> {
    entries.iter().map(|entry| entry.title.as_str()).collect()
}

fn held(trending: &WorldTrending) -> (i64, World) {
    trending.held.lock().unwrap().clone().expect("a world is held")
}

fn provider_key() -> String {
    format!("{:x}", std::process::id())
}

fn trending_week(path: &str) -> (u16, Value) {
    let results = match path {
        "/trending/movie/week" => {
            json!([{ "id": 603, "title": "The Matrix", "backdrop_path": "/m.jpg" }])
        }
        "/trending/tv/week" => {
            json!([{ "id": 1396, "name": "Breaking Bad", "backdrop_path": "/b.jpg" }])
        }
        _ => return (404, json!({})),
    };
    (200, json!({ "page": 1, "total_pages": 1, "results": results }))
}

#[test]
fn a_household_of_several_leads_with_its_own_plays_and_the_world_fills_the_rest() {
    let row = blend(ids(&["home1", "home2"]), 3, &ids(&["home2", "world1", "world2"]), 4);

    assert_eq!(row, ["home1", "home2", "world1", "world2"]);
}

#[test]
fn a_household_of_one_is_given_the_world_s_ranking_and_not_its_own_history() {
    let row = blend(ids(&["mine1", "mine2"]), 1, &ids(&["world1", "world2"]), 10);

    assert_eq!(row, ["world1", "world2"]);
}

#[test]
fn the_row_stops_at_its_cap_whichever_side_fills_it() {
    let world = ids(&["w1", "w2", "w3"]);

    assert_eq!(blend(ids(&["h1", "h2", "h3"]), 2, &world, 2), ["h1", "h2"]);
    assert_eq!(blend(Vec::new(), 2, &world, 2), ["w1", "w2"]);
}

#[test]
fn films_and_shows_of_the_same_place_stand_together() {
    let ranked = interleave(vec![(false, 1), (false, 2), (false, 3)], vec![(true, 7)]);

    assert_eq!(ranked, [(false, 1), (true, 7), (false, 2), (false, 3)]);
}

#[test]
fn a_server_with_no_provider_key_holds_nothing_and_asks_nobody() {
    let state = test_state();

    let ranked = state.home.world.ranked(&state);

    assert!(ranked.is_empty());
    assert!(!state.home.world.fetching.load(Ordering::Acquire));
}

#[test]
fn what_is_held_is_answered_as_it_is() {
    let state = test_state();
    state.home.world.hold(vec![(false, 603), (true, 1396)]);

    assert_eq!(*state.home.world.ranked(&state), [(false, 603), (true, 1396)]);
}

#[test]
fn a_fresh_answer_replaces_what_is_held_and_stays_fresh_for_its_time() {
    let trending = WorldTrending::default();
    trending.hold(vec![(false, 1)]);
    trending.fetching.store(true, Ordering::Release);

    trending.settle(world_of(vec![film(603)], Vec::new()), NOW);

    let (due, world) = held(&trending);
    assert_eq!(*world.ranked, [(false, 603)]);
    assert_eq!(due, NOW + FRESH_FOR_MS);
    assert!(!trending.fetching.load(Ordering::Acquire));
}

#[test]
fn a_failed_read_keeps_what_was_held_and_is_due_again_after_the_retry_delay() {
    let trending = WorldTrending::default();
    trending.hold_world(vec![(false, 1)], vec![splash("held")]);
    trending.fetching.store(true, Ordering::Release);

    trending.settle(None, NOW);

    let (due, world) = held(&trending);
    assert_eq!(*world.ranked, [(false, 1)]);
    assert_eq!(titles(&world.covers), ["held"]);
    assert_eq!(due, NOW + RETRY_AFTER_MS);
    assert!(!trending.fetching.load(Ordering::Acquire));
}

#[test]
fn a_first_read_that_fails_holds_an_empty_world_until_the_retry_delay_is_over() {
    let trending = WorldTrending::default();

    trending.settle(None, NOW);

    let (due, world) = held(&trending);
    assert!(world.ranked.is_empty());
    assert_eq!(due, NOW + RETRY_AFTER_MS);
}

#[test]
fn a_read_under_way_is_not_started_a_second_time() {
    let state = test_state_with_tmdb(&provider_key());
    state.home.world.fetching.store(true, Ordering::Release);

    let started = state.home.world.refresh(&state);

    assert!(started.is_none());
}

#[test]
fn a_server_with_a_provider_key_reads_the_ranking_and_its_covers_in_the_background() {
    let state = test_state_with_tmdb(&provider_key());

    let _provider = FakeTmdb::start_shared(trending_week);

    state.home.world.refresh(&state).expect("a read starts").join().unwrap();

    assert_eq!(*state.home.world.ranked(&state), [(false, 603), (true, 1396)]);
    assert_eq!(titles(&state.home.world.covers(&state)), ["The Matrix", "Breaking Bad"]);
    assert!(!state.home.world.fetching.load(Ordering::Acquire));
}

#[test]
fn a_sample_that_fills_the_cap_alone_is_kept_whole() {
    let state = test_state();
    state.home.world.hold_world(Vec::new(), vec![splash("world1")]);
    let sample = vec![splash("home1"), splash("home2"), splash("home3")];

    let filled = with_world(&state, sample, 2);

    assert_eq!(titles(&filled), ["home1", "home2", "home3"]);
}

#[test]
fn a_short_sample_is_filled_up_to_the_cap_with_what_the_world_watches() {
    let state = test_state();
    let covers = vec![splash("world1"), splash("world2"), splash("world3")];
    state.home.world.hold_world(Vec::new(), covers);

    let filled = with_world(&state, vec![splash("home1")], 3);

    assert_eq!(titles(&filled), ["home1", "world1", "world2"]);
}

#[test]
fn a_short_sample_stays_as_it_is_when_no_world_is_held() {
    let state = test_state();

    let filled = with_world(&state, vec![splash("home1")], 3);

    assert_eq!(titles(&filled), ["home1"]);
}
