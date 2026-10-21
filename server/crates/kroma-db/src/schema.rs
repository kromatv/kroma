//! Opening a database: the pool, and the core schema's history on top of it.

use std::path::Path;
use anyhow::Result;
use rusqlite::Connection;

use kroma_sqlite::{open_with, Legacy, Pool, Schema};

mod ddl;
mod legacy;
mod migrations;
mod steps;
mod titled_wanted;

pub(crate) use ddl::{FILE_COLS, ITEM_COLS, SCHEMA};
pub(crate) use migrations::MIGRATIONS;

pub(crate) const BASELINE: &str = include_str!("schema/baseline.sql");

pub(crate) const CORE: Schema<'static> = Schema {
    name: "the core database",
    baseline: BASELINE,
    baseline_version: 1,
    steps: steps::STEPS,
    legacy: Some(Legacy::Code(legacy::adopt)),
};

pub fn init(path: &Path) -> Result<Pool> {
    let pool = open_with(path, 8)?;
    let mut conn = pool.get()?;
    kroma_sqlite::migrate(&mut conn, &CORE, Some(path))?;
    drop(conn);
    Ok(pool)
}

/// Re-derives what the legacy migrations used to fill in on every boot, for rows
/// a restored backup wrote in an older shape.
pub(crate) fn repair_restored(conn: &Connection) {
    legacy::replay_data(conn);
}

/// A database as a release from before versioning left it: the legacy schema,
/// and no schema version.
#[cfg(test)]
pub(crate) fn legacy_database(path: &Path) -> Pool {
    let pool = open_with(path, 1).unwrap();
    legacy::adopt(&pool.get().unwrap()).unwrap();
    pool
}

#[cfg(test)]
mod history;

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_sqlite::apply_migrations;

    #[test]
    fn a_modules_schema_applies_beside_the_core_one_and_a_broken_batch_names_itself() {
        let pool = crate::testing::temp_pool("schema-module");
        let conn = pool.get().unwrap();

        apply_migrations(
            &conn,
            "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);\
             CREATE INDEX IF NOT EXISTS idx_notes_body ON notes(body);",
        )
        .unwrap();
        conn.execute("INSERT INTO notes (id, body) VALUES ('n1', 'hi')", [])
            .unwrap();

        apply_migrations(
            &conn,
            "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);",
        )
        .unwrap();
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            rows, 1,
            "re-applying the schema must not drop the module's data"
        );

        let err = apply_migrations(&conn, "CREATE TABL oops (").unwrap_err();
        assert!(
            format!("{err:#}").contains("failed to apply module schema"),
            "{err:#}"
        );
    }

    #[test]
    fn init_opens_a_database_whose_wanted_table_predates_the_backoff_columns() {
        let dir = kroma_testing::temp_dir("schema-wanted-upgrade");
        let path = dir.path().join("kroma.db");

        let old = Connection::open(&path).unwrap();
        old.execute_batch(
            "CREATE TABLE wanted (\
                 id             TEXT PRIMARY KEY,\
                 request_id     TEXT NOT NULL,\
                 kind           TEXT NOT NULL,\
                 tmdb_id        INTEGER NOT NULL,\
                 title          TEXT NOT NULL,\
                 season         INTEGER,\
                 episode        INTEGER,\
                 air_date       TEXT,\
                 status         TEXT NOT NULL DEFAULT 'wanted',\
                 last_search_at INTEGER,\
                 updated_at     INTEGER NOT NULL);\
             CREATE INDEX idx_wanted_search ON wanted(status, last_search_at);\
             INSERT INTO wanted (id, request_id, kind, tmdb_id, title, updated_at)\
                 VALUES ('w1', 'r1', 'episode', 42, 'Show', 0);",
        )
        .unwrap();
        drop(old);

        let pool = init(&path).expect("an existing database must still open");
        let conn = pool.get().unwrap();

        let due: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM wanted WHERE next_search_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(due, 1, "rows from before the column keep their turn");

        let indexes: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'wanted'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<std::result::Result<_, _>>()
            .unwrap();
        assert!(indexes.iter().any(|n| n == "idx_wanted_due"), "{indexes:?}");
        assert!(
            !indexes.iter().any(|n| n == "idx_wanted_search"),
            "{indexes:?}"
        );
    }

    #[test]
    fn init_names_the_series_a_play_was_logged_without() {
        let dir = kroma_testing::temp_dir("schema-history-series");
        let path = dir.path().join("kroma.db");
        let old = legacy_database(&path);
        old.get()
            .unwrap()
            .execute_batch(
                "INSERT INTO libraries (id,name,kind,path,added_at) \
                     VALUES ('lib-tv','Series','tv','/media','2026-01-01');\
                 INSERT INTO shows (id,library,title,added_at) \
                     VALUES ('hotd','lib-tv','House of the Dragon','2026-01-01');\
                 INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES ('ep','episode','Salt and Sea, Fire and Blood','mkv','lib-tv','hotd',3,1,'2026-01-01');\
                 INSERT INTO play_history (id,user_id,username,item_id,kind,title,started_at,ended_at,watched_ms) \
                     VALUES ('p1','u1','alice','ep','episode','Salt and Sea, Fire and Blood',0,100,1000);",
            )
            .unwrap();
        drop(old);

        let pool = init(&path).unwrap();

        let row: (Option<String>, Option<i64>, Option<i64>, Option<String>) = pool
            .get()
            .unwrap()
            .query_row(
                "SELECT show_title, season, episode, library FROM play_history WHERE id = 'p1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            row,
            (
                Some("House of the Dragon".to_string()),
                Some(3),
                Some(1),
                Some("lib-tv".to_string())
            )
        );
    }

    #[test]
    fn init_leaves_a_play_whose_title_has_left_the_catalog_blank() {
        let dir = kroma_testing::temp_dir("schema-history-gone");
        let path = dir.path().join("kroma.db");
        let old = legacy_database(&path);
        old.get()
            .unwrap()
            .execute(
                "INSERT INTO play_history (id,user_id,username,item_id,kind,title,started_at,ended_at,watched_ms) \
                 VALUES ('p1','u1','alice','deleted','episode','The Dundies',0,100,1000)",
                [],
            )
            .unwrap();
        drop(old);

        let pool = init(&path).unwrap();

        let row: (Option<String>, Option<i64>, Option<String>) = pool
            .get()
            .unwrap()
            .query_row(
                "SELECT show_title, season, library FROM play_history WHERE id = 'p1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (None, None, None));
    }

    #[test]
    fn init_repins_downloads_a_previous_release_marked_manual() {
        let dir = kroma_testing::temp_dir("schema-match-source");
        let path = dir.path().join("kroma.db");
        let old = legacy_database(&path);
        old.get()
            .unwrap()
            .execute_batch(
                "INSERT INTO downloads (id, client_id, client_ref, kind, tmdb_id, release_title, \
                     magnet_or_url, grabbed_at, match_source) \
                 VALUES ('d1', 'embedded', '', 'movie', 603, 'R', 'm', 0, 'manual'), \
                        ('d2', 'embedded', '', 'movie', 0, 'R', 'm', 0, 'none'), \
                        ('d3', 'embedded', '', 'movie', 42, 'R', 'm', 0, 'auto'); ",
            )
            .unwrap();
        drop(old);

        let pool = init(&path).unwrap();

        let sources: Vec<Option<String>> = pool
            .get()
            .unwrap()
            .prepare("SELECT match_source FROM downloads ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<std::result::Result<_, _>>()
            .unwrap();
        assert_eq!(
            sources,
            [
                Some("pinned".to_string()),
                Some("none".to_string()),
                Some("auto".to_string())
            ]
        );
    }

    #[test]
    fn a_title_taken_off_monitoring_stays_off_after_a_restart() {
        let dir = kroma_testing::temp_dir("schema-unmonitor");
        let path = dir.path().join("kroma.db");
        let pool = init(&path).unwrap();
        pool.get()
            .unwrap()
            .execute_batch(
                "INSERT INTO requests (id, kind, tmdb_id, title, status, created_at, updated_at) \
                     VALUES ('r1', 'show', 42, 'Show', 'approved', 5, 6); \
                 INSERT INTO wanted (id, request_id, kind, tmdb_id, title, season, episode, updated_at) \
                     VALUES ('w1', 'r1', 'episode', 42, 'Show', 1, 1, 1); \
                 INSERT INTO monitored (kind, tmdb_id, title, seasons, monitor_new_seasons, \
                     added_at, updated_at) VALUES ('show', 42, 'Show', '[1]', 1, 5, 6);",
            )
            .unwrap();
        crate::delete_monitored(&pool, kroma_domain::RequestKind::Show, 42).unwrap();
        drop(pool);

        let pool = init(&path).unwrap();

        let monitored: i64 = pool
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM monitored", [], |r| r.get(0))
            .unwrap();
        assert_eq!(monitored, 0);
    }

    #[test]
    fn a_play_a_restored_backup_wrote_without_its_series_gets_it_back_at_once() {
        let pool = crate::testing::temp_pool("schema-restore-repair");
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) \
                 VALUES ('lib-tv','Series','tv','/media','2026-01-01');\
             INSERT INTO shows (id,library,title,added_at) \
                 VALUES ('hotd','lib-tv','House of the Dragon','2026-01-01');\
             INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                 VALUES ('ep','episode','Salt and Sea','mkv','lib-tv','hotd',3,1,'2026-01-01');\
             INSERT INTO play_history (id,user_id,username,item_id,kind,title,started_at,ended_at,watched_ms) \
                 VALUES ('p1','u1','alice','ep','episode','Salt and Sea',0,100,1000);",
        )
        .unwrap();

        repair_restored(&conn);

        let series: Option<String> = conn
            .query_row("SELECT show_title FROM play_history WHERE id = 'p1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(series.as_deref(), Some("House of the Dragon"));
    }
}
