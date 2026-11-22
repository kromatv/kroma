use super::finding::known_to_tmdb_as;
use super::*;

const DARK: &str = "shows/Dark (2017)/Season 01/Dark S01E02.mkv";

fn series(id: &str, described: Value) -> (&'static str, Value) {
    let mut row = json!({ "id": id, "kind": "series" });
    row.as_object_mut()
        .unwrap()
        .extend(described.as_object().unwrap().clone());
    ("2", row)
}

fn ana_said(states: Vec<Value>) -> Vec<((&'static str, &'static str), Value)> {
    states
        .into_iter()
        .map(|state| (("42", "2"), state))
        .collect()
}

fn favourite(title: &str) -> Value {
    json!({ "title": title, "favourite": true, "lastPlayedAt": LAST_WEEK })
}

fn the_show(world: &World) -> String {
    lines(&world.state, "SELECT id FROM shows").remove(0)
}

fn saved_by_ana(world: &World) -> Vec<String> {
    db::list_my_list(&world.state.db, &world.ana).unwrap()
}

#[test]
fn a_series_a_person_marked_as_a_favourite_there_is_on_their_list_here() {
    let dark = series("s1", json!({ "title": "Dark", "year": 2017 }));
    let world = a_household_that_holds(vec![dark], ana_said(vec![favourite("s1")]));
    world.has_scanned(&[DARK]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 1, 0));
    assert_eq!(saved_by_ana(&world), [the_show(&world)]);
}

#[test]
fn a_series_is_found_by_the_id_another_catalogue_gives_it_before_its_name() {
    let dunkel = series(
        "s1",
        json!({ "title": "Dunkel", "ids": { "tmdb": "70523" } }),
    );
    let world = a_household_that_holds(vec![dunkel], ana_said(vec![favourite("s1")]));
    world.has_scanned(&[DARK]);
    known_to_tmdb_as(&world, "show", &the_show(&world), 70523);

    world.imports();

    assert_eq!(saved_by_ana(&world), [the_show(&world)]);
}

#[test]
fn a_series_brings_its_favourite_and_nothing_else() {
    let dark = series("s1", json!({ "title": "Dark" }));
    let finished = json!({
        "title": "s1",
        "watched": true,
        "positionMs": 600_000,
        "favourite": true,
        "lastPlayedAt": LAST_WEEK,
    });
    let world = a_household_that_holds(vec![dark], ana_said(vec![finished]));
    world.has_scanned(&[DARK]);

    world.imports();

    let show = the_show(&world);
    assert_eq!(saved_by_ana(&world), std::slice::from_ref(&show));
    assert!(
        !db::list_watched(&world.state.db, &world.ana)
            .unwrap()
            .contains(&show)
    );
    assert!(
        db::get_progress(&world.state.db, &world.ana, &show)
            .unwrap()
            .is_none()
    );
}

#[test]
fn a_series_favourite_that_matches_no_show_here_is_counted_as_unmatched() {
    let elsewhere = series("s1", json!({ "title": "Babylon Berlin", "year": 2017 }));
    let world = a_household_that_holds(vec![elsewhere], ana_said(vec![favourite("s1")]));
    world.has_scanned(&[DARK]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 0, 1));
    assert!(saved_by_ana(&world).is_empty());
}

#[test]
fn a_series_taken_off_the_list_here_stays_off_when_the_other_server_offers_it_again() {
    let dark = series("s1", json!({ "title": "Dark", "year": 2017 }));
    let world = a_household_that_holds(vec![dark], ana_said(vec![favourite("s1")]));
    world.has_scanned(&[DARK]);
    world.imports();
    db::remove_from_list(&world.state.db, &world.ana, &the_show(&world)).unwrap();
    world.server.change(|household| {
        household.states = ana_said(vec![json!({ "title": "s1", "favourite": true, "playCount": 1 })]);
    });

    world.imports();

    assert!(saved_by_ana(&world).is_empty());
}
