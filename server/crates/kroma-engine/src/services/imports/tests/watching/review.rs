use super::*;

const DARK_1: &str = "shows/Dark/Season 01/Dark S01E01.mkv";
const DARK_2: &str = "shows/Dark/Season 01/Dark S01E02.mkv";
const PLAYED_PERCENT: i64 = 90;

fn watched(title: &str) -> Value {
    json!({ "title": title, "watched": true, "lastPlayedAt": LAST_WEEK })
}

fn finished(title: &str, at: i64) -> Value {
    json!({ "title": title, "watched": true, "lastPlayedAt": at })
}

fn episode_of_dark(id: &str, number: u32) -> (&'static str, Value) {
    let episode = json!({
        "id": id,
        "kind": "episode",
        "series": { "title": "Dark" },
        "season": 1,
        "episode": number,
        "paths": [format!("/data/shows/Dark/Season 01/Dark S01E{number:02}.mkv")],
    });
    ("2", episode)
}

fn known_to_tmdb_as(world: &World, kind: &str, subject: &str, tmdb: i64) {
    world
        .state
        .db
        .get()
        .unwrap()
        .execute(
            "INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,imdb_id,updated_at) \
             VALUES (?1,?2,CAST(?3 AS INTEGER),'tt' || ?3,0)",
            [kind, subject, &tmdb.to_string()],
        )
        .unwrap();
}

fn watched_here(world: &World) -> Vec<String> {
    db::list_watched(&world.state.db, &world.ana).unwrap()
}

fn continue_watching(world: &World) -> Vec<(String, i64)> {
    db::continue_watching(&world.state.db, &world.ana, PLAYED_PERCENT)
        .unwrap()
        .into_iter()
        .map(|resumable| (resumable.item.id, resumable.position_ms))
        .collect()
}

fn now_secs() -> i64 {
    crate::services::jobs::now_ms() / 1000
}

#[test]
fn a_film_finished_on_the_other_server_after_the_first_import_leaves_continue_watching() {
    let stopped_there = of_ana(vec![stopped("t1", 1_200_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    world.server.change(|household| {
        household.states = of_ana(vec![finished("t1", LAST_WEEK + A_DAY)]);
    });

    world.imports();

    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
    assert_eq!(continue_watching(&world), Vec::<(String, i64)>::new());
}

#[test]
fn an_episode_finished_on_the_other_server_after_the_first_import_gives_way_to_the_next_one() {
    let titles = vec![episode_of_dark("e1", 1), episode_of_dark("e2", 2)];
    let stopped_there = vec![(("42", "2"), stopped("e1", 600_000, LAST_WEEK))];
    let world = a_household_that_holds(titles, stopped_there);
    world.has_scanned(&[DARK_1, DARK_2]);
    world.imports();
    world.server.change(|household| {
        household.states = vec![(("42", "2"), finished("e1", LAST_WEEK + A_DAY))];
    });

    world.imports();

    assert_eq!(watched_here(&world), [world.title_of(DARK_1)]);
    assert_eq!(continue_watching(&world), [(world.title_of(DARK_2), 0)]);
}

#[test]
fn a_state_for_a_file_no_scan_writes_goes_to_the_title_its_name_matches() {
    let old_rip = json!({
        "id": "t1",
        "kind": "movie",
        "title": "Heat",
        "year": 1995,
        "paths": ["/data/movies/old rips/Heat.wmv"],
    });
    let world = a_household_that_holds(vec![("1", old_rip)], of_ana(vec![watched("t1")]));
    world.has_the_file("films/old rips/Heat.wmv");
    world.has_scanned(&[HEAT]);

    let ran = world.imports();
    world.scans();

    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
    assert_eq!(ran.import.report.states, states(1, 1, 0));
}

#[test]
fn a_state_for_a_file_no_scan_writes_and_no_title_matches_is_reported_as_unmatched() {
    let old_rip = json!({
        "id": "t1",
        "kind": "movie",
        "title": "Heat",
        "year": 1995,
        "paths": ["/data/movies/Heat (1995)/Heat (1995).wmv"],
    });
    let world = a_household_that_holds(vec![("1", old_rip)], of_ana(vec![watched("t1")]));
    world.has_the_file("films/Heat (1995)/Heat (1995).wmv");
    world.has_scanned(&[RONIN]);

    let ran = world.imports();
    world.scans();

    assert_eq!(world.watch_state(), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn a_state_for_a_file_in_a_folder_the_scan_skips_is_not_held() {
    let trashed = json!({
        "id": "t1",
        "kind": "movie",
        "paths": ["/data/movies/.trash/Heat (1995).mkv"],
    });
    let world = a_household_that_holds(vec![("1", trashed)], of_ana(vec![watched("t1")]));
    world.has_the_file("films/.trash/Heat (1995).mkv");

    let ran = world.imports();
    world.scans();

    assert_eq!(world.watch_state(), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn a_file_reached_under_a_spelling_no_folder_lists_waits_for_nothing() {
    let decomposed = json!({
        "id": "t1",
        "kind": "movie",
        "paths": ["/data/movies/Ame\u{301}lie (2001)/Ame\u{301}lie (2001).mkv"],
    });
    let world = a_household_that_holds(vec![("1", decomposed)], of_ana(vec![watched("t1")]));
    world.has_the_file("films/Am\u{e9}lie (2001)/Am\u{e9}lie (2001).mkv");

    let ran = world.imports();

    assert_eq!(world.watch_state(), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn a_path_that_differs_by_case_from_the_scanned_file_still_finds_its_title() {
    let lower_folder = json!({
        "id": "t1",
        "kind": "movie",
        "title": "Heat",
        "year": 1995,
        "paths": ["/data/movies/heat (1995)/Heat (1995).mkv"],
    });
    let world = a_household_that_holds(vec![("1", lower_folder)], of_ana(vec![watched("t1")]));
    world.has_scanned(&[HEAT]);
    let folds_case = world
        .disk
        .path()
        .join("films/heat (1995)/Heat (1995).mkv")
        .is_file();
    if !folds_case {
        return;
    }

    let ran = world.imports();
    world.scans();

    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
    assert_eq!(ran.import.report.states, states(1, 1, 0));
}

#[test]
fn a_series_another_catalogue_knows_under_another_id_is_another_series() {
    let namesake = json!({
        "id": "e1",
        "kind": "episode",
        "series": { "title": "Dark", "year": 1999, "ids": { "tmdb": "111" } },
        "season": 1,
        "episode": 2,
    });
    let said_there = vec![(("42", "2"), watched("e1"))];
    let world = a_household_that_holds(vec![("2", namesake)], said_there);
    world.has_scanned(&[DARK_2]);
    let show: String = lines(&world.state, "SELECT id FROM shows").remove(0);
    known_to_tmdb_as(&world, "show", &show, 70523);

    let ran = world.imports();

    assert_eq!(watched_here(&world), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn a_film_another_catalogue_knows_under_another_id_is_another_film() {
    let namesake = json!({
        "id": "t1",
        "kind": "movie",
        "title": "Heat",
        "year": 1995,
        "ids": { "tmdb": "111" },
        "paths": ["/elsewhere/Heat.mkv"],
    });
    let world = a_household_that_holds(vec![("1", namesake)], of_ana(vec![watched("t1")]));
    world.has_scanned(&[HEAT]);
    known_to_tmdb_as(&world, "item", &world.title_of(HEAT), 949);

    let ran = world.imports();

    assert_eq!(watched_here(&world), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn a_title_played_here_after_an_import_is_first_in_continue_watching() {
    let in_twelve_hours = now_secs() + 12 * 3600;
    let stopped_there = of_ana(vec![stopped("t1", 1_200_000, in_twelve_hours)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    let ronin = world.title_of(RONIN);
    db::upsert_progress(&world.state.db, &world.ana, &ronin, 900_000, Some(7_200_000)).unwrap();

    let resumable = continue_watching(&world);

    assert_eq!(resumable.first(), Some(&(ronin, 900_000)));
}

#[test]
fn a_person_who_watched_further_here_since_a_server_whose_clock_runs_ahead_is_not_moved_back() {
    let an_hour_ago_on_a_clock_three_hours_ahead = now_secs() + 2 * 3600;
    let stopped_there = of_ana(vec![stopped(
        "t1",
        1_200_000,
        an_hour_ago_on_a_clock_three_hours_ahead,
    )]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT]);
    let heat = world.title_of(HEAT);
    db::upsert_progress(&world.state.db, &world.ana, &heat, 6_000_000, None).unwrap();

    world.imports();

    assert_eq!(
        world.resume_point(HEAT).map(|(position, _)| position),
        Some(6_000_000)
    );
}

#[test]
fn a_series_whose_name_only_starts_like_one_here_is_another_series() {
    let sequel = json!({
        "id": "e1",
        "kind": "episode",
        "series": { "title": "Dark 疾風伝" },
        "season": 1,
        "episode": 2,
    });
    let said_there = vec![(("42", "2"), watched("e1"))];
    let world = a_household_that_holds(vec![("2", sequel)], said_there);
    world.has_scanned(&[DARK_2]);

    let ran = world.imports();

    assert_eq!(watched_here(&world), Vec::<String>::new());
    assert_eq!(ran.import.report.states, states(1, 0, 1));
}
