use super::*;

const REMOVED_AT: i64 = LAST_WEEK + A_DAY;

fn heat_as_ana_left_it(
    watched: bool,
    favourite: bool,
    at: i64,
) -> Vec<((&'static str, &'static str), Value)> {
    of_ana(vec![json!({
        "title": "t1",
        "watched": watched,
        "favourite": favourite,
        "lastPlayedAt": at,
    })])
}

fn parts_of(world: &World, file: &str) -> Vec<String> {
    let title = world.title_of(file);
    let held = world.watch_state();
    held.iter()
        .filter(|line| line.contains(&format!("|{title}|")))
        .map(|line| line.split('|').next().unwrap().to_string())
        .collect()
}

fn ana_unmarks_heat_a_day_after_she_watched_it(world: &World) {
    db::unmark_watched(&world.state.db, &world.ana, &world.title_of(HEAT)).unwrap();
    world
        .state
        .db
        .get()
        .unwrap()
        .execute("UPDATE watch_removals SET removed_at = ?1", [REMOVED_AT])
        .unwrap();
}

#[test]
fn a_title_unmarked_here_stays_unwatched_when_the_other_server_changes_its_row_for_another_reason()
{
    let world = a_household_that_holds(
        heat_and_ronin(),
        heat_as_ana_left_it(true, false, LAST_WEEK),
    );
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    ana_unmarks_heat_a_day_after_she_watched_it(&world);
    world.server.change(|household| {
        household.states = heat_as_ana_left_it(true, true, LAST_WEEK);
    });

    world.imports();

    assert_eq!(parts_of(&world, HEAT), ["listed"]);
}

#[test]
fn a_title_watched_again_on_the_other_server_after_it_was_unmarked_here_is_watched_here() {
    let world = a_household_that_holds(
        heat_and_ronin(),
        heat_as_ana_left_it(true, false, LAST_WEEK),
    );
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    ana_unmarks_heat_a_day_after_she_watched_it(&world);
    world.server.change(|household| {
        household.states = heat_as_ana_left_it(true, false, REMOVED_AT + A_DAY);
    });

    world.imports();

    assert_eq!(parts_of(&world, HEAT), ["watched"]);
}
