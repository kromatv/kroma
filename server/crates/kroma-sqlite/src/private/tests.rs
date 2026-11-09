use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use crate::{apply_migrations, journal_of, migrate, open, Legacy, Run, Schema, Step};

fn mode(path: &Path) -> u32 {
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}

fn open_to_everyone(path: &Path) {
    std::fs::write(path, b"").unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o644)).unwrap();
}

const NOTES: &str = "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);";

#[test]
fn a_new_database_and_its_journals_are_readable_by_their_owner_only() {
    let dir = kroma_testing::temp_dir("private-new");
    let path = dir.path().join("kroma.db");

    let pool = open(&path).unwrap();
    apply_migrations(&pool.get().unwrap(), NOTES).unwrap();
    pool.get()
        .unwrap()
        .execute("INSERT INTO notes VALUES ('n1', 'secret')", [])
        .unwrap();

    assert_eq!(mode(&path), 0o600);
    assert_eq!(mode(&journal_of(&path, "-wal")), 0o600);
    assert_eq!(mode(&journal_of(&path, "-shm")), 0o600);
}

#[test]
fn a_database_and_its_old_copies_left_open_to_everyone_are_closed_when_it_opens() {
    let dir = kroma_testing::temp_dir("private-old");
    let path = dir.path().join("kroma.db");
    let wal = journal_of(&path, "-wal");
    let copy = dir.path().join("kroma.db.pre-v3");
    let neighbour = dir.path().join("notes.txt");
    for file in [&path, &wal, &copy, &neighbour] {
        open_to_everyone(file);
    }

    let _pool = open(&path).unwrap();

    assert_eq!(mode(&path), 0o600);
    assert_eq!(mode(&wal), 0o600);
    assert_eq!(mode(&copy), 0o600);
    assert_eq!(mode(&neighbour), 0o644);
}

#[test]
fn the_copy_a_migration_keeps_is_readable_by_its_owner_only() {
    let dir = kroma_testing::temp_dir("private-snapshot");
    let path = dir.path().join("kroma.db");
    let pool = open(&path).unwrap();
    apply_migrations(&pool.get().unwrap(), NOTES).unwrap();
    let steps = [Step {
        name: "0002_notes_pinned",
        run: Run::Sql("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"),
        rebuilds: false,
    }];
    let schema = Schema {
        name: "notes",
        baseline: NOTES,
        baseline_version: 1,
        steps: &steps,
        legacy: Some(Legacy::Sql(NOTES)),
    };

    migrate(&mut pool.get().unwrap(), &schema, Some(&path)).unwrap();

    let copies = crate::migrate::snapshots_of(&path);
    assert!(!copies.is_empty(), "the upgrade kept a copy");
    assert!(copies.iter().all(|copy| mode(copy) == 0o600));
}

#[test]
fn a_link_is_left_as_it_is() {
    let dir = kroma_testing::temp_dir("private-link");
    let target = dir.path().join("elsewhere.db");
    open_to_everyone(&target);
    let link = dir.path().join("kroma.db.pre-v9");
    std::os::unix::fs::symlink(&target, &link).unwrap();

    super::restrict(&link);

    assert_eq!(mode(&target), 0o644);
}
