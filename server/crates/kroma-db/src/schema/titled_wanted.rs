//! Moving `wanted` from one ledger per request to one row per monitored unit.

use rusqlite::{Connection, OptionalExtension};

const COLUMNS: &[&str] = &[
    "id",
    "request_id",
    "kind",
    "tmdb_id",
    "imdb_id",
    "title",
    "year",
    "season",
    "episode",
    "air_date",
    "status",
    "last_search_at",
    "search_attempts",
    "next_search_at",
    "updated_at",
];

const TABLE: &str = "CREATE TABLE wanted_titled (
    id             TEXT PRIMARY KEY,
    request_id     TEXT REFERENCES requests(id) ON DELETE SET NULL,
    kind           TEXT NOT NULL,
    tmdb_id        INTEGER NOT NULL,
    imdb_id        TEXT,
    title          TEXT NOT NULL,
    year           INTEGER,
    season         INTEGER,
    episode        INTEGER,
    air_date       TEXT,
    status         TEXT NOT NULL DEFAULT 'wanted',
    last_search_at INTEGER,
    search_attempts INTEGER NOT NULL DEFAULT 0,
    next_search_at INTEGER,
    updated_at     INTEGER NOT NULL)";

const INDEXES: &str = "
    CREATE INDEX IF NOT EXISTS idx_wanted_request ON wanted(request_id);
    CREATE INDEX IF NOT EXISTS idx_wanted_ident ON wanted(tmdb_id, season, episode);
    CREATE INDEX IF NOT EXISTS idx_wanted_due ON wanted(status, next_search_at, air_date)";

const UNIT_INDEX: &str = "CREATE UNIQUE INDEX IF NOT EXISTS idx_wanted_unit \
    ON wanted(kind, tmdb_id, IFNULL(season, -1), IFNULL(episode, -1))";

/// Rebuilds a `wanted` table whose rows still require a request, keeping one
/// row per unit (the furthest along when two requests asked for the same
/// episode), then makes the unit unique. A no-op once applied.
pub(super) fn apply(conn: &Connection) -> rusqlite::Result<()> {
    if requires_request(conn)? {
        rebuild(conn)?;
    }
    conn.execute(UNIT_INDEX, [])?;
    Ok(())
}

fn requires_request(conn: &Connection) -> rusqlite::Result<bool> {
    let not_null: Option<i64> = conn
        .query_row(
            "SELECT \"notnull\" FROM pragma_table_info('wanted') WHERE name = 'request_id'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    Ok(not_null == Some(1))
}

fn rebuild(conn: &Connection) -> rusqlite::Result<()> {
    let present: Vec<String> = conn
        .prepare("SELECT name FROM pragma_table_info('wanted')")?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let copied = COLUMNS
        .iter()
        .filter(|column| present.iter().any(|p| p == *column))
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    conn.execute_batch("PRAGMA foreign_keys = OFF")?;
    let rebuilt = conn.execute_batch(&format!(
        "BEGIN;
         {TABLE};
         INSERT INTO wanted_titled ({copied})
         SELECT {copied} FROM (
             SELECT *, ROW_NUMBER() OVER (
                 PARTITION BY kind, tmdb_id, IFNULL(season, -1), IFNULL(episode, -1)
                 ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'grabbed' THEN 1 ELSE 2 END,
                          updated_at DESC
             ) AS unit_rank FROM wanted
         ) WHERE unit_rank = 1;
         DROP TABLE wanted;
         ALTER TABLE wanted_titled RENAME TO wanted;
         {INDEXES};
         COMMIT;"
    ));
    if rebuilt.is_err() {
        let _ = conn.execute_batch("ROLLBACK");
    }
    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    rebuilt
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::schema::init;

    const OLD_WANTED: &str = "CREATE TABLE wanted (
        id             TEXT PRIMARY KEY,
        request_id     TEXT NOT NULL,
        kind           TEXT NOT NULL,
        tmdb_id        INTEGER NOT NULL,
        imdb_id        TEXT,
        title          TEXT NOT NULL,
        year           INTEGER,
        season         INTEGER,
        episode        INTEGER,
        air_date       TEXT,
        status         TEXT NOT NULL DEFAULT 'wanted',
        last_search_at INTEGER,
        updated_at     INTEGER NOT NULL)";

    fn old_database(name: &str) -> (kroma_testing::TempDir, std::path::PathBuf) {
        let dir = kroma_testing::temp_dir(name);
        let path = dir.path().join("kroma.db");
        let old = Connection::open(&path).unwrap();
        old.execute_batch(&format!(
            "{OLD_WANTED};
             INSERT INTO wanted (id, request_id, kind, tmdb_id, title, season, episode, status, updated_at)
                 VALUES ('w-old', 'r-old', 'episode', 42, 'Show', 1, 1, 'available', 1),
                        ('w-new', 'r-new', 'episode', 42, 'Show', 1, 1, 'wanted', 2),
                        ('w-two', 'r-new', 'episode', 42, 'Show', 1, 2, 'wanted', 2);"
        ))
        .unwrap();
        (dir, path)
    }

    fn statuses(conn: &Connection) -> Vec<(String, String)> {
        conn.prepare("SELECT id, status FROM wanted ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn two_requests_for_one_episode_keep_the_row_furthest_along() {
        let (_dir, path) = old_database("titled-wanted-dedup");

        let pool = init(&path).unwrap();

        let conn = pool.get().unwrap();
        assert_eq!(
            statuses(&conn),
            [
                ("w-old".to_string(), "available".to_string()),
                ("w-two".to_string(), "wanted".to_string())
            ]
        );
    }

    #[test]
    fn a_rebuilt_row_no_longer_needs_a_request() {
        let (_dir, path) = old_database("titled-wanted-nullable");

        let pool = init(&path).unwrap();

        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO wanted (id, kind, tmdb_id, title, season, episode, updated_at) \
             VALUES ('w-free', 'episode', 42, 'Show', 2, 1, 3)",
            [],
        )
        .unwrap();
        let duplicate = conn.execute(
            "INSERT INTO wanted (id, kind, tmdb_id, title, season, episode, updated_at) \
             VALUES ('w-again', 'episode', 42, 'Show', 2, 1, 3)",
            [],
        );
        assert!(duplicate.is_err());
    }

    #[test]
    fn a_movie_is_one_unit_even_with_no_season() {
        let dir = kroma_testing::temp_dir("titled-wanted-movie");
        let pool = init(&dir.path().join("kroma.db")).unwrap();
        let conn = pool.get().unwrap();
        let insert = |id: &str| {
            conn.execute(
                "INSERT INTO wanted (id, kind, tmdb_id, title, updated_at) \
                 VALUES (?1, 'movie', 603, 'The Matrix', 1)",
                [id],
            )
        };

        let first = insert("w-1");
        let second = insert("w-2");

        assert!(first.is_ok());
        assert!(second.is_err());
    }

    #[test]
    fn opening_twice_rebuilds_once_and_keeps_every_row() {
        let (_dir, path) = old_database("titled-wanted-twice");
        drop(init(&path).unwrap());

        let pool = init(&path).unwrap();

        let conn = pool.get().unwrap();
        assert_eq!(statuses(&conn).len(), 2);
    }

    #[test]
    fn a_title_a_request_filled_a_ledger_for_becomes_monitored() {
        let dir = kroma_testing::temp_dir("titled-wanted-backfill");
        let path = dir.path().join("kroma.db");
        let pool = init(&path).unwrap();
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "INSERT INTO requests (id, kind, tmdb_id, title, status, created_at, updated_at)
                 VALUES ('r-whole', 'show', 42, 'Show', 'approved', 5, 6),
                        ('r-some', 'show', 43, 'Other', 'available', 5, 6),
                        ('r-wait', 'show', 44, 'Pending', 'pending', 5, 6);
             UPDATE requests SET seasons = '[2]' WHERE id = 'r-some';
             INSERT INTO wanted (id, request_id, kind, tmdb_id, title, season, episode, updated_at)
                 VALUES ('a', 'r-whole', 'episode', 42, 'Show', 1, 1, 1),
                        ('b', 'r-whole', 'episode', 42, 'Show', 3, 1, 1),
                        ('c', 'r-some', 'episode', 43, 'Other', 2, 1, 1);",
        )
        .unwrap();
        drop(conn);
        drop(pool);

        let pool = init(&path).unwrap();

        let conn = pool.get().unwrap();
        let monitored: Vec<(i64, String, i64, Option<i64>)> = conn
            .prepare(
                "SELECT tmdb_id, seasons, monitor_new_seasons, last_season FROM monitored \
                 ORDER BY tmdb_id",
            )
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            monitored,
            [
                (42, "[1,3]".to_string(), 1, Some(3)),
                (43, "[2]".to_string(), 0, Some(2))
            ]
        );
    }
}
