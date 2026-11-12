use std::os::unix::fs::symlink;

use kroma_wasm_host::SqlValue;

use super::*;

const CORE: &str = "/kroma/core.sqlite";

struct Layout {
    _dir: kroma_testing::TempDir,
    root: PathBuf,
    own: PathBuf,
    kept: PathBuf,
}

impl Layout {
    fn new(tag: &str) -> Self {
        let dir = kroma_testing::temp_dir(tag);
        let root = dir.path().canonicalize().unwrap();
        let seed = rusqlite::Connection::open(root.join("core.sqlite")).unwrap();
        seed.execute_batch(
            "CREATE TABLE granted (id INTEGER); CREATE TABLE secret (id INTEGER);
             INSERT INTO granted VALUES (1); INSERT INTO secret VALUES (2);",
        )
        .unwrap();
        let own = root.join("modules/tv.example");
        let kept = root.join("databases/tv.example");
        std::fs::create_dir_all(&own).unwrap();
        std::fs::create_dir_all(&kept).unwrap();
        Self {
            _dir: dir,
            root,
            own,
            kept,
        }
    }

    fn databases(&self, grant: Grant) -> ModuleDatabases {
        ModuleDatabases::new(
            "tv.example",
            self.root.join("core.sqlite"),
            CORE,
            self.own.clone(),
            self.kept.clone(),
            grant,
        )
    }

    fn asked(&self, name: &str) -> String {
        self.own.join(name).to_string_lossy().into_owned()
    }

    fn core_tables(&self) -> Vec<String> {
        rusqlite::Connection::open(self.root.join("core.sqlite"))
            .unwrap()
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }
}

fn read_grant() -> Grant {
    Grant {
        read: vec!["granted".to_string()],
        write: Vec::new(),
    }
}

#[test]
fn a_granted_table_answers_and_another_is_refused_at_the_host() {
    let layout = Layout::new("component-grant");
    let databases = layout.databases(read_grant());
    let mut core = databases.open(CORE).unwrap();

    let allowed = core.run("SELECT id FROM granted", &[]).unwrap();
    let denied = core.run("SELECT id FROM secret", &[]);

    assert!(matches!(allowed.rows[0][0], SqlValue::Integer(1)));
    assert!(denied.is_err());
}

#[test]
fn a_grant_for_reading_does_not_write() {
    let layout = Layout::new("component-grant-write");
    let databases = layout.databases(read_grant());
    let mut core = databases.open(CORE).unwrap();

    let denied = core.run("INSERT INTO granted VALUES (3)", &[]);

    assert!(denied.is_err());
}

#[test]
fn a_path_outside_the_module_folder_does_not_open() {
    let layout = Layout::new("component-other-file");
    let databases = layout.databases(Grant::none());

    let core_file = databases.open(&layout.root.join("core.sqlite").to_string_lossy());
    let climbed = databases.open(&layout.asked("../../core.sqlite"));

    assert!(core_file.is_err());
    assert!(climbed.is_err());
}

#[test]
fn a_name_that_is_a_journal_or_a_folder_is_refused() {
    let layout = Layout::new("component-names");
    let databases = layout.databases(Grant::none());

    for asked in ["module.sqlite-wal", "module.sqlite-shm", "module.sqlite-journal", "sub/x.sqlite", ".x"] {
        assert!(databases.open(&layout.asked(asked)).is_err(), "{asked}");
    }
}

#[test]
fn the_own_database_is_kept_where_the_module_does_not_reach() {
    let layout = Layout::new("component-kept");
    let databases = layout.databases(Grant::none());

    let mut named = databases.open(&layout.asked("module.sqlite")).unwrap();
    named.batch("CREATE TABLE mine (id INTEGER); INSERT INTO mine VALUES (1)").unwrap();
    let mut bare = databases.open("module.sqlite").unwrap();
    let seen = bare.run("SELECT COUNT(*) FROM mine", &[]).unwrap();

    assert!(matches!(seen.rows[0][0], SqlValue::Integer(1)));
    assert!(layout.kept.join("module.sqlite").is_file());
    assert_eq!(std::fs::read_dir(&layout.own).unwrap().count(), 0);
}

#[test]
fn links_planted_in_the_module_folder_reach_nothing() {
    let layout = Layout::new("component-planted");
    let elsewhere = layout.root.join("elsewhere");
    std::fs::write(&elsewhere, "untouched").unwrap();
    symlink("../../core.sqlite", layout.own.join("module.sqlite")).unwrap();
    symlink("../../elsewhere", layout.own.join("module.sqlite-wal")).unwrap();
    symlink("../../elsewhere", layout.own.join("module.sqlite-shm")).unwrap();
    let databases = layout.databases(Grant::none());

    let mut conn = databases.open(&layout.asked("module.sqlite")).unwrap();
    conn.batch("CREATE TABLE mine (id INTEGER); INSERT INTO mine VALUES (1)").unwrap();
    let secret = conn.run("SELECT COUNT(*) FROM secret", &[]);

    assert!(secret.is_err());
    assert_eq!(layout.core_tables(), ["granted", "secret"]);
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "untouched");
}

#[test]
fn a_link_in_the_kept_folder_is_refused() {
    for name in ["module.sqlite", "module.sqlite-wal", "module.sqlite-shm"] {
        let layout = Layout::new("component-kept-link");
        symlink("../../core.sqlite", layout.kept.join(name)).unwrap();
        let databases = layout.databases(Grant::none());

        let opened = databases.open(&layout.asked("module.sqlite"));

        assert!(opened.is_err(), "{name}");
        assert_eq!(layout.core_tables(), ["granted", "secret"]);
    }
}

#[test]
fn the_own_file_cannot_attach_another() {
    let layout = Layout::new("component-own");
    let databases = layout.databases(Grant::none());
    let mut conn = databases.open(&layout.asked("module.sqlite")).unwrap();

    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();
    let wrote = conn.run("INSERT INTO mine VALUES (?1)", &[SqlValue::Integer(9)]).unwrap();
    let attach = conn.batch(&format!("ATTACH DATABASE '{}' AS core", layout.root.join("core.sqlite").display()));

    assert_eq!(wrote.changes, 1);
    assert!(attach.is_err());
}

#[test]
fn a_transaction_left_open_is_rolled_back_when_its_connection_closes() {
    let layout = Layout::new("component-rollback");
    let databases = layout.databases(Grant::none());
    let path = layout.asked("module.sqlite");
    let mut first = databases.open(&path).unwrap();
    first.batch("CREATE TABLE mine (id INTEGER)").unwrap();

    first.batch("BEGIN").unwrap();
    first.run("INSERT INTO mine VALUES (1)", &[]).unwrap();
    drop(first);
    let mut second = databases.open(&path).unwrap();
    let seen = second.run("SELECT COUNT(*) FROM mine", &[]).unwrap();

    assert!(matches!(seen.rows[0][0], SqlValue::Integer(0)));
}

#[test]
fn a_snapshot_is_kept_beside_the_database_and_never_elsewhere() {
    let layout = Layout::new("component-snapshot");
    let databases = layout.databases(Grant::none());
    let mut conn = databases.open(&layout.asked("module.sqlite")).unwrap();
    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();

    let kept = conn.snapshot(&layout.asked("module.sqlite.pre-v2"));
    let escaped = conn.snapshot(&layout.root.join("stolen.sqlite").to_string_lossy());
    let over_itself = conn.snapshot(&layout.asked("module.sqlite"));

    assert!(kept.is_ok());
    assert!(escaped.is_err());
    assert!(over_itself.is_err());
    assert!(layout.kept.join("module.sqlite.pre-v2").is_file());
    assert!(!layout.own.join("module.sqlite.pre-v2").exists());
    assert!(!layout.root.join("stolen.sqlite").exists());
}

#[test]
fn a_snapshot_never_writes_through_a_link() {
    let layout = Layout::new("component-snapshot-link");
    let elsewhere = layout.root.join("elsewhere");
    std::fs::write(&elsewhere, "untouched").unwrap();
    symlink("../../elsewhere", layout.kept.join("module.sqlite.pre-v2")).unwrap();
    let databases = layout.databases(Grant::none());
    let mut conn = databases.open(&layout.asked("module.sqlite")).unwrap();
    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();

    let copied = conn.snapshot(&layout.asked("module.sqlite.pre-v2"));

    assert!(copied.is_err());
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "untouched");
}

#[test]
fn only_the_newest_snapshots_are_kept() {
    let layout = Layout::new("component-snapshot-pruned");
    let databases = layout.databases(Grant::none());
    let mut conn = databases.open(&layout.asked("module.sqlite")).unwrap();
    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();

    for version in 1..=4 {
        conn.snapshot(&layout.asked(&format!("module.sqlite.pre-v{version}"))).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let left: Vec<bool> = (1..=4)
        .map(|version| layout.kept.join(format!("module.sqlite.pre-v{version}")).exists())
        .collect();

    assert_eq!(left.iter().filter(|kept| **kept).count(), kroma_sqlite::KEPT_SNAPSHOTS);
    assert!(left[3]);
}
