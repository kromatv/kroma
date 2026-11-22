use super::*;
use crate::services::sections;

#[test]
fn a_resume_point_an_import_moved_forward_shows_on_the_home_without_a_wait() {
    let stopped_there = of_ana(vec![stopped("t1", 600_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    let ronin = world.title_of(RONIN);
    db::upsert_progress(
        &world.state.db,
        &world.ana,
        &ronin,
        300_000,
        Some(10_200_000),
    )
    .unwrap();
    let before = sections::home(&world.state, &world.state.db, "en", &world.ana);
    world.server.change(|household| {
        household.states = of_ana(vec![stopped("t1", 1_800_000, LAST_WEEK + A_DAY)]);
    });

    world.imports();

    let after = sections::home(&world.state, &world.state.db, "en", &world.ana);
    assert_eq!(
        world.resume_point(HEAT).map(|(position, _)| position),
        Some(1_800_000)
    );
    assert!(!Arc::ptr_eq(&before, &after));
}
