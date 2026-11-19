use super::*;

const DARK_2: &str = "shows/Dark/Season 01/Dark S01E02.mkv";

fn elsewhere(id: &str, described: Value) -> (&'static str, Value) {
    let mut title = json!({ "id": id, "kind": "movie", "paths": [format!("/elsewhere/{id}.mkv")] });
    title
        .as_object_mut()
        .unwrap()
        .extend(described.as_object().unwrap().clone());
    ("1", title)
}

fn watched(title: &str) -> Value {
    json!({ "title": title, "watched": true, "lastPlayedAt": LAST_WEEK })
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

#[test]
fn a_title_whose_file_is_not_here_is_matched_by_the_id_another_catalogue_gives_it() {
    let titles = vec![
        elsewhere("t1", json!({ "title": "La Chaleur", "ids": { "tmdb": "949" } })),
        elsewhere("t2", json!({ "title": "Rien", "ids": { "imdb": "tt8195" } })),
    ];
    let world = a_household_that_holds(titles, of_ana(vec![watched("t1"), watched("t2")]));
    world.has_scanned(&[HEAT, RONIN]);
    let (heat, ronin) = (world.title_of(HEAT), world.title_of(RONIN));
    known_to_tmdb_as(&world, "item", &heat, 949);
    known_to_tmdb_as(&world, "item", &ronin, 8195);

    let ran = world.imports();

    let mut watched = watched_here(&world);
    watched.sort_unstable();
    let mut expected = vec![heat, ronin];
    expected.sort_unstable();
    assert_eq!(ran.import.report.states, states(2, 2, 0));
    assert_eq!(watched, expected);
}

#[test]
fn a_title_no_id_matches_is_matched_by_its_name_and_its_year() {
    let titles = vec![
        elsewhere("t1", json!({ "title": "HEAT!", "year": 1995, "ids": { "tmdb": "1" } })),
        elsewhere("t2", json!({ "title": "Ronin", "year": 1999 })),
        elsewhere("t3", json!({ "title": "Ronin" })),
    ];
    let said_there = of_ana(vec![watched("t1"), watched("t2"), watched("t3")]);
    let world = a_household_that_holds(titles, said_there);
    world.has_scanned(&[HEAT, RONIN]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(3, 1, 2));
    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
}

#[test]
fn a_name_in_letters_outside_latin_matches_that_name_and_no_other_of_its_year() {
    let seven_samurai = "films/七人の侍 (1995)/七人の侍 (1995).mkv";
    let titles = vec![
        elsewhere("t1", json!({ "title": "千と千尋の神隠し", "year": 1995 })),
        elsewhere("t2", json!({ "title": "七人の侍", "year": 1995 })),
    ];
    let said_there = of_ana(vec![watched("t1"), watched("t2")]);
    let world = a_household_that_holds(titles, said_there);
    world.has_scanned(&[seven_samurai]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(2, 1, 1));
    assert_eq!(watched_here(&world), [world.title_of(seven_samurai)]);
}

#[test]
fn a_series_of_the_same_name_and_another_year_is_another_series() {
    let remake = json!({
        "id": "e1",
        "kind": "episode",
        "series": { "title": "Dark", "year": 1999 },
        "season": 1,
        "episode": 2,
    });
    let said_there = vec![(("42", "2"), watched("e1"))];
    let world = a_household_that_holds(vec![("2", remake)], said_there);
    world.has_scanned(&["shows/Dark (2017)/Season 01/Dark S01E02.mkv"]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 0, 1));
}

#[test]
fn an_episode_is_matched_by_its_series_its_season_and_its_number() {
    let by_id = json!({
        "id": "e1",
        "kind": "episode",
        "series": { "title": "Dunkel", "ids": { "tmdb": "70523" } },
        "season": 1,
        "episode": 2,
    });
    let by_name = json!({
        "id": "e2",
        "kind": "episode",
        "title": "Lies",
        "series": { "title": "Dark" },
        "season": 1,
        "episode": 2,
    });
    let another_number = json!({
        "id": "e3",
        "kind": "episode",
        "series": { "title": "Dark" },
        "season": 1,
        "episode": 3,
    });
    let said_there = vec![
        (("42", "2"), stopped("e1", 600_000, LAST_WEEK)),
        (("42", "2"), watched("e2")),
        (("42", "2"), watched("e3")),
    ];
    let titles = vec![("2", by_id), ("2", by_name), ("2", another_number)];
    let world = a_household_that_holds(titles, said_there);
    world.has_scanned(&[DARK_2]);
    let episode = world.title_of(DARK_2);
    let show: String = lines(&world.state, "SELECT id FROM shows").remove(0);
    known_to_tmdb_as(&world, "show", &show, 70523);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(3, 2, 1));
    assert_eq!(watched_here(&world), [episode]);
    assert_eq!(
        world.resume_point(DARK_2).map(|(position, _)| position),
        Some(600_000)
    );
}

#[test]
fn a_file_answers_before_an_id_that_names_another_copy() {
    let mut heat = film_at("t1", "Heat", 1995);
    heat["ids"] = json!({ "tmdb": "8195" });
    let world = a_household_that_holds(vec![("1", heat)], of_ana(vec![watched("t1")]));
    world.has_scanned(&[HEAT, RONIN]);
    known_to_tmdb_as(&world, "item", &world.title_of(RONIN), 8195);

    world.imports();

    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
}

#[test]
fn a_file_the_scan_has_not_reached_is_waited_for_and_not_matched_to_another_copy() {
    let mut heat = film_at("t1", "Heat", 1995);
    heat["ids"] = json!({ "tmdb": "8195" });
    let world = a_household_that_holds(vec![("1", heat)], of_ana(vec![watched("t1")]));
    world.has_scanned(&[RONIN]);
    known_to_tmdb_as(&world, "item", &world.title_of(RONIN), 8195);
    world.has_the_file(HEAT);

    world.imports();
    let before_the_scan = watched_here(&world);
    world.scans();

    assert_eq!(before_the_scan, Vec::<String>::new());
    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
}

#[test]
fn a_title_with_several_files_is_found_by_the_first_one_this_server_has() {
    let both = json!({
        "id": "t1",
        "kind": "movie",
        "paths": [
            "/data/movies/Heat (1995)/Heat (1995) 4K.mkv",
            "/data/movies/../../etc/passwd",
            "/data/movies/Heat (1995)/Heat (1995).mkv",
        ],
    });
    let world = a_household_that_holds(vec![("1", both)], of_ana(vec![watched("t1")]));
    world.has_scanned(&[HEAT]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 1, 0));
    assert_eq!(watched_here(&world), [world.title_of(HEAT)]);
}

#[test]
fn a_file_outside_every_source_is_not_waited_for() {
    let stray = json!({ "id": "t1", "kind": "movie", "paths": ["/data/strays/Heat.mkv"] });
    let mut world = a_household_that_holds(vec![("1", stray)], of_ana(vec![watched("t1")]));
    std::fs::create_dir_all(world.disk.path().join("strays")).unwrap();
    world.has_the_file("strays/Heat.mkv");
    let strays = folder(&world.disk, "/data/strays", "strays");
    world.stages.folders.push(strays);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 0, 1));
    assert_eq!(world.watch_state(), Vec::<String>::new());
}
