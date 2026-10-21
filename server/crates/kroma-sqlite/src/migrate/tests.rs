use rusqlite::Connection;

use super::*;

const BASELINE: &str = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)";

const ADD_PINNED: Step = Step {
    name: "notes_pinned",
    run: Run::Sql("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"),
    rebuilds: false,
};

const SCHEMA: Schema<'static> = Schema {
    name: "the test database",
    baseline: BASELINE,
    baseline_version: 1,
    steps: &[ADD_PINNED],
    legacy: Some(Legacy::Code(adopt_legacy)),
};

fn adopt_legacy(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "ALTER TABLE notes ADD COLUMN body TEXT NOT NULL DEFAULT '';
         CREATE TABLE IF NOT EXISTS adopted (at INTEGER);
         INSERT INTO adopted VALUES (1);",
    )?;
    Ok(())
}

fn columns(conn: &Connection, table: &str) -> Vec<String> {
    conn.prepare("SELECT name FROM pragma_table_info(?1)")
        .unwrap()
        .query_map([table], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

#[test]
fn a_new_file_starts_from_the_baseline_and_runs_every_step() {
    let mut conn = Connection::open_in_memory().unwrap();

    let migrated = migrate(&mut conn, &SCHEMA, None).unwrap();

    assert_eq!(migrated, Migrated::Created);
    assert_eq!(user_version(&conn).unwrap(), 2);
    assert_eq!(columns(&conn, "notes"), ["id", "body", "pinned"]);
}

#[test]
fn an_up_to_date_database_is_left_alone() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate(&mut conn, &SCHEMA, None).unwrap();
    let cookie = count(&conn, "PRAGMA schema_version");

    let migrated = migrate(&mut conn, &SCHEMA, None).unwrap();

    assert_eq!(migrated, Migrated::Current);
    assert_eq!(count(&conn, "PRAGMA schema_version"), cookie);
}

#[test]
fn a_database_a_newer_build_wrote_is_refused() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate(&mut conn, &SCHEMA, None).unwrap();
    conn.pragma_update(None, "user_version", 9).unwrap();

    let err = migrate(&mut conn, &SCHEMA, None).unwrap_err();

    assert!(format!("{err:#}").contains("newer KROMA"), "{err:#}");
}

#[test]
fn a_database_older_than_the_baseline_is_refused() {
    let squashed = Schema {
        baseline_version: 5,
        ..SCHEMA
    };
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(BASELINE).unwrap();
    conn.pragma_update(None, "user_version", 3).unwrap();

    let err = migrate(&mut conn, &squashed, None).unwrap_err();

    assert!(format!("{err:#}").contains("earlier release"), "{err:#}");
}

#[test]
fn a_database_from_before_versioning_is_adopted_once_and_then_takes_the_steps() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE notes (id TEXT PRIMARY KEY)")
        .unwrap();

    let first = migrate(&mut conn, &SCHEMA, None).unwrap();
    let second = migrate(&mut conn, &SCHEMA, None).unwrap();

    assert_eq!(first, Migrated::Upgraded { from: 0, to: 2 });
    assert_eq!(second, Migrated::Current);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM adopted"), 1);
    assert_eq!(columns(&conn, "notes"), ["id", "body", "pinned"]);
}

#[test]
fn a_database_from_before_versioning_is_refused_when_nothing_can_adopt_it() {
    let strict = Schema {
        legacy: None,
        ..SCHEMA
    };
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(BASELINE).unwrap();

    let err = migrate(&mut conn, &strict, None).unwrap_err();

    assert!(format!("{err:#}").contains("no schema version"), "{err:#}");
}

#[test]
fn a_failing_step_leaves_the_database_at_the_version_before_it() {
    let broken = Schema {
        steps: &[
            ADD_PINNED,
            Step {
                name: "broken",
                run: Run::Sql("ALTER TABLE notes ADD COLUMN tag TEXT; SELECT * FROM missing"),
                rebuilds: false,
            },
        ],
        ..SCHEMA
    };
    let mut conn = Connection::open_in_memory().unwrap();

    let err = migrate(&mut conn, &broken, None).unwrap_err();

    assert!(format!("{err:#}").contains("step 3 (broken)"), "{err:#}");
    assert_eq!(user_version(&conn).unwrap(), 2);
    assert_eq!(columns(&conn, "notes"), ["id", "body", "pinned"]);
}

#[test]
fn a_rebuild_runs_without_foreign_keys_and_refuses_to_leave_a_row_dangling() {
    fn rebuild_notes(conn: &Connection) -> rusqlite::Result<()> {
        conn.execute_batch(
            "CREATE TABLE notes_new (id TEXT PRIMARY KEY, body TEXT);
             INSERT INTO notes_new SELECT id, body FROM notes WHERE id <> 'gone';
             DROP TABLE notes;
             ALTER TABLE notes_new RENAME TO notes;",
        )
    }
    let rebuild = Schema {
        baseline: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);
                   CREATE TABLE links (note TEXT REFERENCES notes(id));",
        steps: &[Step {
            name: "rebuild_notes",
            run: Run::Code(rebuild_notes),
            rebuilds: true,
        }],
        ..SCHEMA
    };
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON").unwrap();
    create(&mut conn, &rebuild).unwrap();
    conn.execute_batch(
        "INSERT INTO notes VALUES ('kept', 'a'), ('gone', 'b');
         INSERT INTO links VALUES ('gone');",
    )
    .unwrap();

    let err = migrate(&mut conn, &rebuild, None).unwrap_err();

    assert!(
        format!("{err:#}").contains("rows point at a row"),
        "{err:#}"
    );
    assert_eq!(user_version(&conn).unwrap(), 1);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM notes"), 2);
    assert_eq!(count(&conn, "PRAGMA foreign_keys"), 1);
}

#[test]
fn an_upgrade_keeps_a_copy_of_the_file_and_only_the_last_two() {
    let dir = kroma_testing::temp_dir("migrate-snapshots");
    let path = dir.path().join("notes.db");
    let mut conn = Connection::open(&path).unwrap();
    conn.execute_batch(BASELINE).unwrap();
    let mut seen = Vec::new();

    for version in 1..=3 {
        conn.pragma_update(None, "user_version", version).unwrap();
        let schema = Schema {
            baseline_version: version,
            steps: &[ADD_PINNED],
            ..SCHEMA
        };
        let _ = conn.execute_batch("ALTER TABLE notes DROP COLUMN pinned");
        migrate(&mut conn, &schema, Some(&path)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        seen.push(snapshot_path(&path, version).exists());
    }

    assert_eq!(seen, [true, true, true]);
    assert!(!snapshot_path(&path, 1).exists());
    assert!(snapshot_path(&path, 2).exists());
    assert!(snapshot_path(&path, 3).exists());
}
