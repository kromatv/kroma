use std::os::unix::fs::{symlink, PermissionsExt};
use std::sync::Arc;

use rusqlite::Connection;

use super::*;
use crate::SupervisorConfig;

const ID: &str = "tv.example.moved";

struct Moved {
    _dir: kroma_testing::TempDir,
    data: PathBuf,
    supervisor: Arc<Supervisor>,
}

impl Moved {
    fn new(tag: &str) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let data = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(data.join("modules").join(ID)).unwrap();
        let supervisor = Supervisor::new(SupervisorConfig {
            modules_dir: data.join("modules"),
            core_port: 0,
            host_token: "t".into(),
            db_path: data.join("kroma.db"),
            data_dir: data.clone(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: None,
        });
        Self {
            _dir: dir,
            data,
            supervisor,
        }
    }

    fn own(&self) -> PathBuf {
        self.data.join("modules").join(ID)
    }

    fn kept(&self) -> PathBuf {
        self.data.join("databases").join(ID)
    }

    fn seed(&self, name: &str, rows: u32) -> PathBuf {
        let path = self.own().join(name);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE kept (id INTEGER)").unwrap();
        for id in 0..rows {
            conn.execute("INSERT INTO kept VALUES (?1)", [id]).unwrap();
        }
        path
    }
}

fn rows(path: &Path) -> i64 {
    Connection::open(path)
        .unwrap()
        .query_row("SELECT COUNT(*) FROM kept", [], |row| row.get(0))
        .unwrap()
}

fn mode(path: &Path) -> u32 {
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}

#[test]
fn a_database_name_is_one_plain_file_name() {
    assert!(is_database_name("module.sqlite"));
    assert!(is_database_name("module.sqlite.pre-v2"));
    assert!(is_database_name("_cache-2.db"));
    assert!(!is_database_name(""));
    assert!(!is_database_name(".."));
    assert!(!is_database_name(".hidden"));
    assert!(!is_database_name("a/b.sqlite"));
    assert!(!is_database_name("module.sqlite-wal"));
    assert!(!is_database_name("module.sqlite-shm"));
    assert!(!is_database_name("module.sqlite-journal"));
    assert!(!is_database_name(&"a".repeat(MAX_NAME + 1)));
}

#[test]
fn a_database_moves_with_the_rows_still_in_its_journal() {
    let moved = Moved::new("databases-wal");
    let scratch = moved.data.join("scratch.sqlite");
    let writer = Connection::open(&scratch).unwrap();
    writer
        .execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;
             CREATE TABLE kept (id INTEGER); INSERT INTO kept VALUES (1), (2), (3);",
        )
        .unwrap();
    std::fs::copy(&scratch, moved.own().join("module.sqlite")).unwrap();
    std::fs::copy(
        kroma_sqlite::journal_of(&scratch, "-wal"),
        moved.own().join("module.sqlite-wal"),
    )
    .unwrap();
    drop(writer);

    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert_eq!(rows(&kept.join("module.sqlite")), 3);
    assert!(!moved.own().join("module.sqlite").exists());
    assert!(!moved.own().join("module.sqlite-wal").exists());
}

#[test]
fn every_database_moves_and_the_modules_other_files_stay() {
    let moved = Moved::new("databases-every");
    moved.seed("module.sqlite", 2);
    moved.seed("module.sqlite.pre-v2", 1);
    std::fs::write(moved.own().join("notes.txt"), "the module's own file").unwrap();
    std::fs::write(moved.own().join("half.sqlite"), "SQLite").unwrap();

    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert_eq!(rows(&kept.join("module.sqlite")), 2);
    assert_eq!(rows(&kept.join("module.sqlite.pre-v2")), 1);
    assert!(moved.own().join("notes.txt").is_file());
    assert!(moved.own().join("half.sqlite").is_file());
    assert!(!kept.join("half.sqlite").exists());
}

#[test]
fn a_link_named_like_a_database_is_left_behind_and_its_target_untouched() {
    let moved = Moved::new("databases-link");
    let target = moved.data.join("elsewhere.sqlite");
    Connection::open(&target)
        .unwrap()
        .execute_batch("CREATE TABLE kept (id INTEGER); INSERT INTO kept VALUES (1);")
        .unwrap();
    symlink("../../elsewhere.sqlite", moved.own().join("module.sqlite")).unwrap();
    std::fs::hard_link(&target, moved.own().join("other.sqlite")).unwrap();

    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert!(!kept.join("module.sqlite").exists());
    assert!(!kept.join("other.sqlite").exists());
    assert_eq!(rows(&target), 1);
}

#[test]
fn a_journal_that_is_a_link_is_not_carried() {
    let moved = Moved::new("databases-journal-link");
    moved.seed("module.sqlite", 2);
    let elsewhere = moved.data.join("elsewhere");
    std::fs::write(&elsewhere, "untouched").unwrap();
    symlink("../../elsewhere", moved.own().join("module.sqlite-wal")).unwrap();
    symlink("../../elsewhere", moved.own().join("module.sqlite-journal")).unwrap();

    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert_eq!(rows(&kept.join("module.sqlite")), 2);
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "untouched");
    assert!(std::fs::symlink_metadata(moved.own().join("module.sqlite-wal")).is_err());
}

#[test]
fn the_move_happens_once() {
    let moved = Moved::new("databases-once");
    moved.seed("module.sqlite", 2);
    moved.supervisor.module_databases(ID).unwrap();

    moved.seed("later.sqlite", 1);
    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert!(!kept.join("later.sqlite").exists());
    assert!(moved.own().join("later.sqlite").is_file());
}

#[test]
fn a_move_that_fails_keeps_the_old_files_and_is_tried_again() {
    let moved = Moved::new("databases-retry");
    let mut broken = b"SQLite format 3\0".to_vec();
    broken.resize(8192, 0xAB);
    std::fs::write(moved.own().join("module.sqlite"), &broken).unwrap();

    let failed = moved.supervisor.module_databases(ID);

    assert!(failed.is_err());
    assert_eq!(std::fs::read(moved.own().join("module.sqlite")).unwrap(), broken);
    assert!(!moved.kept().exists());
    assert_eq!(std::fs::read_dir(moved.data.join("databases")).unwrap().count(), 0);

    std::fs::remove_file(moved.own().join("module.sqlite")).unwrap();
    moved.seed("module.sqlite", 4);
    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert_eq!(rows(&kept.join("module.sqlite")), 4);
}

#[test]
fn the_folders_holding_databases_are_open_to_the_server_alone() {
    let moved = Moved::new("databases-mode");

    let kept = moved.supervisor.module_databases(ID).unwrap();

    assert_eq!(mode(&kept), 0o700);
    assert_eq!(mode(&moved.data.join("databases")), 0o700);
}
