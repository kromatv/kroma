mod again;

use std::sync::atomic::AtomicBool;

use super::super::super::stages::Core;
use super::world::Merging;
use super::*;
use crate::model::{ImportedFrom, PlayEntry, WatchKind};

const HEAT_RUNS_MS: i64 = 10_200_000;

struct Logging<'w> {
    household: &'w Merging,
    stops_after_the_plays: AtomicBool,
}

impl Stages for Logging<'_> {
    fn libraries(
        &self,
        importing: &Importing<'_>,
        kept: &[LibraryRow<'_>],
    ) -> Result<Vec<Outcome>> {
        self.household.libraries(importing, kept)
    }

    fn users(&self, importing: &Importing<'_>, kept: &UserRows<'_>) -> Result<Vec<Outcome>> {
        self.household.users(importing, kept)
    }

    fn titles(&self, importing: &Importing<'_>, page: &TitlePage<'_>) -> Result<Vec<Outcome>> {
        self.household.titles(importing, page)
    }

    fn states(&self, importing: &Importing<'_>, page: &StatePage<'_>) -> Result<Vec<Outcome>> {
        self.household.states(importing, page)
    }

    fn plays(&self, importing: &Importing<'_>, page: &[PlayRow<'_>]) -> Result<Vec<Outcome>> {
        let outcomes = Core.plays(importing, page)?;
        if self.stops_after_the_plays.swap(false, Ordering::SeqCst) {
            anyhow::bail!("the run stopped before the job recorded the plays");
        }
        Ok(outcomes)
    }
}

fn plays(read: u64, brought: u64, unmatched: u64) -> Tally {
    Tally {
        read,
        brought,
        unmatched,
    }
}

fn a_household_that_played(plays: Vec<Value>) -> World {
    let world = a_household_that_holds(heat_and_ronin(), Vec::new());
    world.server.change(|household| household.plays = plays);
    world
}

fn lasting(id: &str, title: &str, duration_ms: u64) -> Value {
    json!({
        "id": id,
        "user": "42",
        "title": title,
        "playedAt": LAST_WEEK,
        "durationMs": duration_ms,
    })
}

fn imports_plays_and(world: &World, stops_after_the_plays: bool) -> Ran {
    let stages = Logging {
        household: &world.stages,
        stops_after_the_plays: AtomicBool::new(stops_after_the_plays),
    };
    import(&world.state, &stages, &kept(&["1", "2"], &["42", "43"]))
}

fn imports_plays(world: &World) -> Ran {
    imports_plays_and(world, false)
}

fn watch_history(world: &World) -> Vec<PlayEntry> {
    db::plays(&world.state.db, &db::PlayFilter::default(), 50, 0).unwrap()
}

fn held_plays(world: &World) -> Vec<String> {
    lines(
        &world.state,
        "SELECT user_id || ' at ' || played_at FROM import_held_plays ORDER BY 1",
    )
}

fn runs_for(world: &World, file: &str, runtime_ms: i64) {
    let conn = world.state.db.get().unwrap();
    conn.execute(
        "UPDATE items SET duration_ms = CAST(?2 AS INTEGER) WHERE id = ?1",
        [world.title_of(file), runtime_ms.to_string()],
    )
    .unwrap();
}

fn time_watched(world: &World) -> (i64, i64) {
    let people = db::top_users(&world.state.db, 0, 10).unwrap();
    let charted = db::history_since(&world.state.db, 0, None, Some(WatchKind::Movie)).unwrap();
    (
        people.iter().map(|person| person.watched_ms).sum(),
        charted.iter().map(|row| row.watched_ms).sum(),
    )
}

#[test]
fn a_play_of_the_other_server_shows_in_watch_history_with_its_account_its_title_and_its_time() {
    let world = a_household_that_played(vec![play("p1", "42", "t1")]);
    world.has_scanned(&[HEAT, RONIN]);

    let ran = imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(ran.import.report.plays, plays(1, 1, 0));
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].user_id.as_deref(), Some(world.ana.as_str()));
    assert_eq!(log[0].username, "ana");
    assert_eq!(log[0].item_id, Some(world.title_of(HEAT)));
    assert_eq!(
        (log[0].kind.as_str(), log[0].title.as_str()),
        ("movie", "Heat")
    );
    assert_eq!((log[0].started_at, log[0].ended_at), (LAST_WEEK, LAST_WEEK));
}

#[test]
fn an_imported_play_says_so_and_names_the_server_it_came_from() {
    let world = a_household_that_played(vec![play("p1", "42", "t1")]);
    world.has_scanned(&[HEAT]);

    imports_plays(&world);

    assert_eq!(
        watch_history(&world)[0].imported_from,
        Some(ImportedFrom {
            importer: IMPORTER.into(),
            name: "Living room".into(),
        })
    );
}

#[test]
fn an_imported_play_leaves_blank_the_device_the_player_the_network_and_the_transcode() {
    let world = a_household_that_played(vec![play("p1", "42", "t1")]);
    world.has_scanned(&[HEAT]);

    imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(log.len(), 1);
    assert_eq!(
        (log[0].device.as_deref(), log[0].player.as_deref()),
        (None, None)
    );
    assert_eq!(
        (log[0].network.as_deref(), log[0].mode.as_deref()),
        (None, None)
    );
}

#[test]
fn a_play_with_no_duration_counts_for_the_runtime_of_its_title_and_its_row_says_so() {
    let world = a_household_that_played(vec![play("p1", "42", "t1")]);
    world.has_scanned(&[HEAT]);
    runs_for(&world, HEAT, HEAT_RUNS_MS);

    imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(time_watched(&world), (HEAT_RUNS_MS, HEAT_RUNS_MS));
    assert_eq!(
        (log[0].watched_ms, log[0].watched_is_runtime),
        (HEAT_RUNS_MS, true)
    );
}

#[test]
fn a_play_the_other_server_timed_counts_for_the_time_it_lasted() {
    let world = a_household_that_played(vec![lasting("p1", "t1", 3_600_000)]);
    world.has_scanned(&[HEAT]);
    runs_for(&world, HEAT, HEAT_RUNS_MS);

    imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(time_watched(&world), (3_600_000, 3_600_000));
    assert_eq!(
        (log[0].watched_ms, log[0].watched_is_runtime),
        (3_600_000, false)
    );
}

#[test]
fn a_duration_no_title_runs_for_is_read_as_no_duration() {
    let world = a_household_that_played(vec![lasting("p1", "t1", u64::MAX)]);
    world.has_scanned(&[HEAT]);
    runs_for(&world, HEAT, HEAT_RUNS_MS);

    imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(
        (log[0].watched_ms, log[0].watched_is_runtime),
        (HEAT_RUNS_MS, true)
    );
}

#[test]
fn a_play_dated_before_the_epoch_or_far_ahead_of_this_clock_is_not_brought() {
    let undated = json!({ "id": "p1", "user": "42", "title": "t1", "playedAt": -5 });
    let next_century =
        json!({ "id": "p2", "user": "42", "title": "t1", "playedAt": 4_102_444_800_i64 });
    let world = a_household_that_played(vec![undated, next_century, play("p3", "42", "t1")]);
    world.has_scanned(&[HEAT]);

    let ran = imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(ran.import.report.plays, plays(3, 1, 0));
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].ended_at, LAST_WEEK);
}

#[test]
fn two_users_attached_to_one_account_who_played_one_title_at_the_same_second_are_two_plays() {
    let mut world = a_household_that_played(vec![play("p1", "42", "t1"), play("p2", "43", "t1")]);
    world.stages.accounts.insert("43", world.ana.clone());
    world.has_scanned(&[HEAT]);

    let ran = imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(ran.import.report.plays, plays(2, 2, 0));
    assert_eq!(log.len(), 2);
    assert!(
        log.iter()
            .all(|row| row.user_id.as_deref() == Some(world.ana.as_str()))
    );
    assert!(log.iter().all(|row| row.ended_at == LAST_WEEK));
}

#[test]
fn a_play_whose_title_is_nothing_here_is_listed_in_the_report_by_its_name_and_its_file() {
    let world = a_household_that_played(vec![play("p1", "42", "t1"), play("p2", "42", "t2")]);
    world.has_scanned(&[HEAT]);

    let ran = imports_plays(&world);

    let window = Window {
        offset: 0,
        limit: 10,
    };
    let listed = db::imports::unmatched(&world.state.db, &ran.import.id, window).unwrap();
    assert_eq!(ran.import.report.plays, plays(2, 1, 1));
    assert_eq!(watch_history(&world).len(), 1);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title.as_deref(), Some("Ronin"));
    assert_eq!(
        listed[0].paths,
        vec!["/data/movies/Ronin (1998)/Ronin (1998).mkv"]
    );
}

#[test]
fn a_play_for_a_file_scanned_later_shows_as_soon_as_the_scan_reaches_it() {
    let world = a_household_that_played(vec![play("p1", "42", "t1")]);
    world.has_the_file(HEAT);
    let ran = imports_plays(&world);
    let before_the_scan = (watch_history(&world).len(), held_plays(&world));

    world.scans();

    let log = watch_history(&world);
    assert_eq!(ran.import.report.plays, plays(1, 1, 0));
    assert_eq!(
        before_the_scan,
        (0, vec![format!("{} at {LAST_WEEK}", world.ana)])
    );
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].item_id, Some(world.title_of(HEAT)));
    assert_eq!(log[0].ended_at, LAST_WEEK);
    assert_eq!(held_plays(&world), Vec::<String>::new());
}
