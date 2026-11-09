use std::cell::Cell;
use std::collections::BTreeMap;

use super::*;
use crate::infra::events::ServerEvent;
use crate::test_support::{seed_movie, test_state};

fn catalogue(state: &SharedState) {
    for i in 0..6 {
        seed_movie(state, &format!("m{i}"));
    }
}

fn viewer(state: &SharedState, name: &str) -> String {
    db::create_user(&state.db, &format!("{name}@t.dev"), name, "h", &[])
        .unwrap()
        .id
}

fn retitle_silently(state: &SharedState, id: &str, title: &str) {
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!("UPDATE items SET title = '{title}' WHERE id = '{id}'"),
            [],
        )
        .unwrap();
}

fn titles(home: &[Section]) -> Vec<String> {
    home.iter()
        .flat_map(|s| &s.items)
        .map(|entry| match entry {
            SectionItem::Movie { item } => item.title.clone(),
            SectionItem::Show { show } => show.title.clone(),
        })
        .collect()
}

fn ids(home: &[Section]) -> Vec<String> {
    home.iter()
        .flat_map(|s| &s.items)
        .map(|entry| entry.id().to_string())
        .collect()
}

fn one_candidate() -> Vec<HeroCandidate> {
    vec![HeroCandidate {
        id: "m0".into(),
        added_at: "t".into(),
        has_backdrop: true,
        has_overview: true,
        rating: None,
        width: 0,
        hdr: false,
    }]
}

const NOON: i64 = 12 * 3_600_000;
const EVENING: i64 = 20 * 3_600_000;

#[test]
fn a_second_visit_with_nothing_changed_is_served_the_same_home() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    let first = home(&state, &state.db, "en", &ann);

    let second = home(&state, &state.db, "en", &ann);

    assert!(Arc::ptr_eq(&first, &second));
}

#[test]
fn a_write_nothing_announced_is_not_seen_by_a_remembered_home() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    home(&state, &state.db, "en", &ann);
    retitle_silently(&state, "m0", "Renamed");

    let again = home(&state, &state.db, "en", &ann);

    assert!(titles(&again).contains(&"Title m0".to_string()));
}

#[test]
fn a_catalogue_change_on_the_bus_rebuilds_the_home() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    home(&state, &state.db, "en", &ann);
    retitle_silently(&state, "m0", "Renamed");

    state
        .events
        .publish(ServerEvent::ItemUpdated { id: "m0".into() });
    let again = home(&state, &state.db, "en", &ann);

    assert!(titles(&again).contains(&"Renamed".to_string()));
}

#[test]
fn a_film_started_since_the_last_visit_leaves_the_rows() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    home(&state, &state.db, "en", &ann);

    db::upsert_progress(&state.db, &ann, "m0", 60_000, Some(600_000)).unwrap();
    let again = home(&state, &state.db, "en", &ann);

    assert!(!ids(&again).contains(&"m0".to_string()));
}

#[test]
fn one_viewer_is_never_served_another_viewers_home() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    let bob = viewer(&state, "bob");
    db::upsert_progress(&state.db, &ann, "m0", 60_000, Some(600_000)).unwrap();
    let anns = home(&state, &state.db, "en", &ann);

    let bobs = home(&state, &state.db, "en", &bob);

    assert!(!ids(&anns).contains(&"m0".to_string()));
    assert!(ids(&bobs).contains(&"m0".to_string()));
}

#[test]
fn each_locale_is_remembered_apart() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    let english = home(&state, &state.db, "en", &ann);

    let french = home(&state, &state.db, "fr", &ann);

    assert!(!Arc::ptr_eq(&english, &french));
}

#[test]
fn the_days_hero_is_reused_until_the_catalogue_moves() {
    let state = test_state();
    catalogue(&state);
    let ann = viewer(&state, "ann");
    let id = hero(&state, &state.db, "en", &ann)
        .unwrap()
        .id()
        .to_string();
    retitle_silently(&state, &id, "Renamed");
    let stale = hero(&state, &state.db, "en", &ann).unwrap();

    state
        .events
        .publish(ServerEvent::ItemUpdated { id: id.clone() });
    let fresh = hero(&state, &state.db, "en", &ann).unwrap();

    assert!(matches!(&stale, SectionItem::Movie { item } if item.title == format!("Title {id}")));
    assert!(matches!(&fresh, SectionItem::Movie { item } if item.title == "Renamed"));
}

#[test]
fn an_empty_catalogue_is_not_remembered_as_having_no_hero() {
    let state = test_state();
    let ann = viewer(&state, "ann");
    hero(&state, &state.db, "en", &ann);
    seed_movie(&state, "m0");

    let picked = hero(&state, &state.db, "en", &ann);

    assert_eq!(picked.map(|e| e.id().to_string()).as_deref(), Some("m0"));
}

#[test]
fn the_evening_reads_as_new_inputs() {
    let state = test_state();
    let ann = viewer(&state, "ann");
    let noon = Inputs::read(&state, &state.db, &ann, NOON).unwrap();

    let evening = Inputs::read(&state, &state.db, &ann, EVENING).unwrap();

    assert_ne!(noon, evening);
}

#[test]
fn turning_the_recently_added_row_off_reads_as_new_inputs() {
    let state = test_state();
    let ann = viewer(&state, "ann");
    let before = Inputs::read(&state, &state.db, &ann, NOON).unwrap();

    state.settings.set_patch(
        &state.db,
        BTreeMap::from([("showRecentHome".to_string(), serde_json::json!(false))]),
    );
    let after = Inputs::read(&state, &state.db, &ann, NOON).unwrap();

    assert_ne!(before, after);
}

#[test]
fn every_viewer_shares_one_read_of_the_hero_candidates() {
    let state = test_state();
    let reads = Cell::new(0);
    let read = || {
        reads.set(reads.get() + 1);
        one_candidate()
    };
    hero_candidates(&state, read);

    let again = hero_candidates(&state, read);

    assert_eq!(reads.get(), 1);
    assert_eq!(again.len(), 1);
}

#[test]
fn a_catalogue_change_reads_the_hero_candidates_again() {
    let state = test_state();
    let reads = Cell::new(0);
    let read = || {
        reads.set(reads.get() + 1);
        one_candidate()
    };
    hero_candidates(&state, read);

    state.events.publish(ServerEvent::ScanCompleted {
        items: 1,
        shows: 0,
        libraries: 1,
    });
    hero_candidates(&state, read);

    assert_eq!(reads.get(), 2);
}

#[test]
fn an_empty_catalogue_is_read_again_for_its_candidates() {
    let state = test_state();
    let reads = Cell::new(0);
    let read = || {
        reads.set(reads.get() + 1);
        Vec::new()
    };
    hero_candidates(&state, read);

    hero_candidates(&state, read);

    assert_eq!(reads.get(), 2);
}
