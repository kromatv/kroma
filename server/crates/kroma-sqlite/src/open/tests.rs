use super::*;
use crate::{user_version, Run};

const NOTES: &str = "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);";

const PINNED: &[Step] = &[Step {
    name: "0002_notes_pinned",
    run: Run::Sql("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"),
    rebuilds: false,
}];

fn store(tag: &str) -> (kroma_testing::TempDir, Pool) {
    let dir = kroma_testing::temp_dir(tag);
    let pool = open(&dir.path().join("module.sqlite")).unwrap();
    (dir, pool)
}

#[test]
fn a_module_store_from_before_steps_keeps_its_rows_and_takes_them() {
    let (_dir, pool) = store("store-legacy");
    apply_migrations(&pool.get().unwrap(), NOTES).unwrap();
    pool.get()
        .unwrap()
        .execute("INSERT INTO notes VALUES ('n1', 'hi')", [])
        .unwrap();

    let migrated = migrate_store(&pool, "tv.kroma.notes", NOTES, PINNED).unwrap();

    let conn = pool.get().unwrap();
    assert_eq!(migrated, Migrated::Upgraded { from: 0, to: 2 });
    assert_eq!(user_version(&conn).unwrap(), 2);
    let pinned: i64 = conn
        .query_row("SELECT pinned FROM notes WHERE id = 'n1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(pinned, 0);
}

#[test]
fn a_module_store_with_no_steps_still_records_its_baseline() {
    let (_dir, pool) = store("store-fresh");

    let first = migrate_store(&pool, "tv.kroma.notes", NOTES, &[]).unwrap();
    let second = migrate_store(&pool, "tv.kroma.notes", NOTES, &[]).unwrap();

    assert_eq!((first, second), (Migrated::Created, Migrated::Current));
}

#[test]
fn a_broken_step_names_the_module_and_the_step() {
    let (_dir, pool) = store("store-broken");
    let broken = [Step {
        name: "0002_oops",
        run: Run::Sql("ALTER TABLE missing ADD COLUMN x"),
        rebuilds: false,
    }];

    let err = migrate_store(&pool, "tv.kroma.notes", NOTES, &broken).unwrap_err();

    assert!(
        format!("{err:#}").contains("tv.kroma.notes step 2 (0002_oops)"),
        "{err:#}"
    );
}
