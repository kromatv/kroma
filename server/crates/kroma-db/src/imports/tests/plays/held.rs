use kroma_domain::watching::Watching;

use super::*;

const HEAT: &str = "/films/Heat (1995)/Heat.mkv";
const RONIN: &str = "/films/Ronin (1998)/Ronin.mkv";

fn a_scan_writes(pool: &Pool, path: &str, item: &str) -> usize {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path) VALUES (?1,?2,?1)",
        [path, item],
    )
    .unwrap();
    release_held_states(&conn).unwrap()
}

fn held(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT abs_path || ' at ' || played_at || ' for ' || COALESCE(duration_ms, '-') \
         FROM import_held_plays ORDER BY 1",
    )
}

impl Household {
    fn holds_heat(&self, id: &str) -> Merged {
        self.adds(&[played(id, &self.ana, Place::File(HEAT))])[0]
    }
}

#[test]
fn a_play_for_a_file_no_title_has_is_held_and_shows_nowhere() {
    let home = a_household();

    let added = home.holds_heat("p1");

    assert_eq!(added, Merged::Changed);
    assert_eq!(held(&home.pool), [format!("{HEAT} at {LAST_WEEK} for -")]);
    assert_eq!(logged(&home.pool).len(), 0);
}

#[test]
fn a_held_play_joins_the_log_as_soon_as_a_scan_writes_its_file() {
    let home = a_household();
    let for_an_hour = NewPlay {
        duration_ms: Some(3_600_000),
        ..played("p1", &home.ana, Place::File(HEAT))
    };
    home.adds(&[for_an_hour]);

    let released = a_scan_writes(&home.pool, HEAT, "heat");

    let log = logged(&home.pool);
    assert_eq!(released, 1);
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].user_id.as_deref(), Some(home.ana.as_str()));
    assert_eq!(log[0].username, "ana");
    assert_eq!(log[0].item_id.as_deref(), Some("heat"));
    assert_eq!((log[0].started_at, log[0].ended_at), (LAST_WEEK, LAST_WEEK));
    assert_eq!(log[0].watched_ms, 3_600_000);
    assert_eq!(
        log[0].imported_from.as_ref().map(|from| from.name.as_str()),
        Some("Living room")
    );
    assert_eq!(held(&home.pool), Vec::<String>::new());
}

#[test]
fn a_scan_that_reaches_another_file_keeps_holding_the_play() {
    let home = a_household();
    a_film(&home.pool, "ronin");
    home.holds_heat("p1");

    let released = a_scan_writes(&home.pool, RONIN, "ronin");

    assert_eq!(released, 0);
    assert_eq!(held(&home.pool).len(), 1);
    assert_eq!(logged(&home.pool).len(), 0);
}

#[test]
fn a_play_held_twice_is_held_once() {
    let home = a_household();
    let first = home.holds_heat("p1");

    let again = home.holds_heat("p1");

    assert_eq!((first, again), (Merged::Changed, Merged::Unchanged));
    assert_eq!(held(&home.pool).len(), 1);
}

#[test]
fn a_play_already_in_the_log_is_not_held() {
    let home = a_household();
    home.plays_heat("p1");

    let again = home.holds_heat("p1");

    assert_eq!(again, Merged::Unchanged);
    assert_eq!(held(&home.pool), Vec::<String>::new());
    assert_eq!(logged(&home.pool).len(), 1);
}

#[test]
fn a_held_play_found_on_its_title_before_the_scan_is_logged_once() {
    let home = a_household();
    home.holds_heat("p1");
    let found = home.plays_heat("p1");

    a_scan_writes(&home.pool, HEAT, "heat");

    assert_eq!(found, Merged::Changed);
    assert_eq!(logged(&home.pool).len(), 1);
    assert_eq!(held(&home.pool), Vec::<String>::new());
}

#[test]
fn a_play_for_a_file_a_scan_wrote_a_moment_ago_joins_the_log_at_once() {
    let home = a_household();
    a_scan_writes(&home.pool, HEAT, "heat");

    let added = home.holds_heat("p1");

    assert_eq!(added, Merged::Changed);
    assert_eq!(logged(&home.pool).len(), 1);
    assert_eq!(held(&home.pool), Vec::<String>::new());
}

#[test]
fn one_scan_releases_the_watch_state_and_the_plays_held_for_its_file() {
    let home = a_household();
    let watched = Watching {
        watched_at: Some(LAST_WEEK),
        ..Default::default()
    };
    merge_states(&home.pool, &home.ana, &[(Place::File(HEAT), watched)]).unwrap();
    home.holds_heat("p1");
    home.holds_heat("p2");

    let released = a_scan_writes(&home.pool, HEAT, "heat");

    assert_eq!(released, 3);
    assert_eq!(logged(&home.pool).len(), 2);
    assert_eq!(rows(&home.pool, "SELECT item_id FROM watched"), ["heat"]);
}

#[test]
fn a_play_held_for_an_account_that_left_the_server_is_dropped() {
    let home = a_household();
    home.holds_heat("p1");

    crate::delete_user(&home.pool, &home.ana).unwrap();

    assert_eq!(held(&home.pool), Vec::<String>::new());
}
