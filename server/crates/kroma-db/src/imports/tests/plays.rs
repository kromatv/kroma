mod held;
mod shown;

use kroma_domain::PlayEntry;

use super::states::{a_film, an_account, rows};
use super::*;
use crate::PlayFilter;

const LAST_WEEK: i64 = 1_700_000_000;
const HEAT_RUNS_MS: i64 = 10_200_000;

struct Household {
    pool: TempPool,
    server: String,
    ana: String,
}

fn a_server(pool: &Pool, origin: &Origin) -> String {
    let id = server_key(IMPORTER, &origin.id);
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO import_servers (id, importer, server, name) VALUES (?1, ?2, ?3, ?4)",
            params![id, IMPORTER, origin.id, origin.name],
        )
        .unwrap();
    id
}

fn a_household() -> Household {
    let pool = pool();
    let server = a_server(&pool, &living_room());
    let ana = an_account(&pool, "ana");
    a_film(&pool, "heat");
    Household { pool, server, ana }
}

fn an_episode(pool: &Pool, id: &str) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO shows (id,library,title,year,added_at) \
         VALUES ('sev','lib','Severance',2022,'t')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
         VALUES (?1,'episode','Half Loop','mkv','lib','sev',1,2,'t')",
        [id],
    )
    .unwrap();
}

fn runs_for(pool: &Pool, item: &str, runtime_ms: i64) {
    pool.get()
        .unwrap()
        .execute(
            "UPDATE items SET duration_ms = ?2 WHERE id = ?1",
            params![item, runtime_ms],
        )
        .unwrap();
}

fn played<'a>(id: &'a str, account: &'a str, place: Place<'a>) -> NewPlay<'a> {
    NewPlay {
        id,
        account,
        place,
        played_at: LAST_WEEK,
        duration_ms: None,
    }
}

fn logged(pool: &Pool) -> Vec<PlayEntry> {
    crate::plays(pool, &PlayFilter::default(), 50, 0).unwrap()
}

impl Household {
    fn adds(&self, plays: &[NewPlay<'_>]) -> Vec<Merged> {
        add_plays(&self.pool, &self.server, plays).unwrap()
    }

    fn plays_heat(&self, id: &str) -> Merged {
        self.adds(&[played(id, &self.ana, Place::Title("heat"))])[0]
    }
}

#[test]
fn a_play_joins_the_log_with_its_account_its_title_and_the_time_it_was_played() {
    let home = a_household();

    let added = home.plays_heat("p1");

    let log = logged(&home.pool);
    assert_eq!(added, Merged::Changed);
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].user_id.as_deref(), Some(home.ana.as_str()));
    assert_eq!(log[0].username, "ana");
    assert_eq!(log[0].item_id.as_deref(), Some("heat"));
    assert_eq!(
        (log[0].kind.as_str(), log[0].title.as_str()),
        ("movie", "heat")
    );
    assert_eq!(log[0].library.as_deref(), Some("lib"));
    assert_eq!((log[0].started_at, log[0].ended_at), (LAST_WEEK, LAST_WEEK));
}

#[test]
fn an_episode_is_logged_with_its_series_its_season_and_its_number() {
    let home = a_household();
    an_episode(&home.pool, "half-loop");

    home.adds(&[played("p1", &home.ana, Place::Title("half-loop"))]);

    let log = logged(&home.pool);
    assert_eq!(
        (log[0].kind.as_str(), log[0].title.as_str()),
        ("episode", "Half Loop")
    );
    assert_eq!(log[0].show_title.as_deref(), Some("Severance"));
    assert_eq!((log[0].season, log[0].episode), (Some(1), Some(2)));
    assert_eq!(log[0].show_id.as_deref(), Some("sev"));
}

#[test]
fn an_imported_play_leaves_blank_what_the_other_server_did_not_record() {
    let home = a_household();

    home.plays_heat("p1");

    let log = logged(&home.pool);
    assert_eq!(log.len(), 1);
    assert_eq!(
        (log[0].device.as_deref(), log[0].player.as_deref()),
        (None, None)
    );
    assert_eq!(
        (log[0].mode.as_deref(), log[0].network.as_deref()),
        (None, None)
    );
    assert_eq!(log[0].video_label, None);
    assert_eq!(log[0].audio_label, None);
}

#[test]
fn a_duration_the_other_server_recorded_is_the_time_watched() {
    let home = a_household();
    runs_for(&home.pool, "heat", HEAT_RUNS_MS);
    let for_an_hour = NewPlay {
        duration_ms: Some(3_600_000),
        ..played("p1", &home.ana, Place::Title("heat"))
    };

    home.adds(&[for_an_hour]);

    let log = logged(&home.pool);
    assert_eq!(log[0].watched_ms, 3_600_000);
    assert!(!log[0].watched_is_runtime);
}

#[test]
fn the_same_play_added_twice_is_one_row() {
    let home = a_household();
    let first = home.plays_heat("p1");

    let again = home.plays_heat("p1");

    assert_eq!((first, again), (Merged::Changed, Merged::Unchanged));
    assert_eq!(logged(&home.pool).len(), 1);
}

#[test]
fn two_plays_of_one_title_by_one_account_at_the_same_second_are_two_rows() {
    let home = a_household();

    let added = home.adds(&[
        played("p1", &home.ana, Place::Title("heat")),
        played("p2", &home.ana, Place::Title("heat")),
    ]);

    assert_eq!(added, [Merged::Changed, Merged::Changed]);
    assert_eq!(logged(&home.pool).len(), 2);
}

#[test]
fn the_same_id_on_two_servers_is_two_plays() {
    let home = a_household();
    let den = Origin {
        id: "srv-2".into(),
        name: "Den".into(),
    };
    let other_server = a_server(&home.pool, &den);
    home.plays_heat("p1");

    let added = add_plays(
        &home.pool,
        &other_server,
        &[played("p1", &home.ana, Place::Title("heat"))],
    )
    .unwrap();

    assert_eq!(added, [Merged::Changed]);
    assert_eq!(logged(&home.pool).len(), 2);
}

#[test]
fn a_play_whose_title_or_account_left_the_server_is_not_written() {
    let home = a_household();

    let added = home.adds(&[
        played("p1", &home.ana, Place::Title("left-the-catalogue")),
        played("p2", "left-the-server", Place::Title("heat")),
        played("p3", "left-the-server", Place::File("/films/Heat.mkv")),
    ]);

    assert_eq!(added, [Merged::Gone, Merged::Gone, Merged::Gone]);
    assert_eq!(logged(&home.pool).len(), 0);
    assert_eq!(
        rows(&home.pool, "SELECT id FROM import_held_plays"),
        Vec::<String>::new()
    );
}

#[test]
fn a_play_placed_on_a_whole_show_is_never_logged() {
    let home = a_household();
    an_episode(&home.pool, "half-loop");

    let added = home.adds(&[played("p1", &home.ana, Place::Show("sev"))]);

    assert_eq!(added, [Merged::Gone]);
    assert!(logged(&home.pool).is_empty());
}
