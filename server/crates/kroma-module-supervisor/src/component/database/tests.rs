use kroma_wasm_host::SqlValue;

use super::*;

const CORE: &str = "/kroma/core.sqlite";

fn databases(dir: &Path, grant: Grant) -> ModuleDatabases {
    let core = dir.join("core.sqlite");
    let seed = rusqlite::Connection::open(&core).unwrap();
    seed.execute_batch(
        "CREATE TABLE granted (id INTEGER); CREATE TABLE secret (id INTEGER);
         INSERT INTO granted VALUES (1); INSERT INTO secret VALUES (2);",
    )
    .unwrap();
    let own = dir.join("modules/tv.example");
    std::fs::create_dir_all(&own).unwrap();
    ModuleDatabases::new("tv.example", core, CORE, own, grant)
}

fn read_grant() -> Grant {
    Grant {
        read: vec!["granted".to_string()],
        write: Vec::new(),
    }
}

#[test]
fn a_granted_table_answers_and_another_is_refused_at_the_host() {
    let dir = kroma_testing::temp_dir("component-grant");
    let databases = databases(dir.path(), read_grant());
    let mut core = databases.open(CORE).unwrap();

    let allowed = core.run("SELECT id FROM granted", &[]).unwrap();
    let denied = core.run("SELECT id FROM secret", &[]);

    assert!(matches!(allowed.rows[0][0], SqlValue::Integer(1)));
    assert!(denied.is_err());
}

#[test]
fn a_grant_for_reading_does_not_write() {
    let dir = kroma_testing::temp_dir("component-grant-write");
    let databases = databases(dir.path(), read_grant());
    let mut core = databases.open(CORE).unwrap();

    let denied = core.run("INSERT INTO granted VALUES (3)", &[]);

    assert!(denied.is_err());
}

#[test]
fn a_path_outside_the_module_folder_does_not_open() {
    let dir = kroma_testing::temp_dir("component-other-file");
    let databases = databases(dir.path(), Grant::none());

    let core_file = databases.open(&dir.path().join("core.sqlite").to_string_lossy());
    let climbed = databases.open(&dir.path().join("modules/tv.example/../../core.sqlite").to_string_lossy());

    assert!(core_file.is_err());
    assert!(climbed.is_err());
}

#[test]
fn the_own_file_opens_and_cannot_attach_another() {
    let dir = kroma_testing::temp_dir("component-own");
    let databases = databases(dir.path(), Grant::none());
    let own = dir.path().join("modules/tv.example/module.sqlite");
    let mut conn = databases.open(&own.to_string_lossy()).unwrap();

    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();
    let wrote = conn.run("INSERT INTO mine VALUES (?1)", &[SqlValue::Integer(9)]).unwrap();
    let attach = conn.batch(&format!("ATTACH DATABASE '{}' AS core", dir.path().join("core.sqlite").display()));

    assert_eq!(wrote.changes, 1);
    assert!(attach.is_err());
}

#[test]
fn a_transaction_left_open_is_rolled_back_when_its_connection_closes() {
    let dir = kroma_testing::temp_dir("component-rollback");
    let databases = databases(dir.path(), Grant::none());
    let own = dir.path().join("modules/tv.example/module.sqlite");
    let path = own.to_string_lossy();
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
fn a_snapshot_stays_in_the_module_folder() {
    let dir = kroma_testing::temp_dir("component-snapshot");
    let databases = databases(dir.path(), Grant::none());
    let own = dir.path().join("modules/tv.example/module.sqlite");
    let mut conn = databases.open(&own.to_string_lossy()).unwrap();
    conn.batch("CREATE TABLE mine (id INTEGER)").unwrap();

    let kept = conn.snapshot(&dir.path().join("modules/tv.example/module.sqlite.pre-v2").to_string_lossy());
    let escaped = conn.snapshot(&dir.path().join("stolen.sqlite").to_string_lossy());

    assert!(kept.is_ok());
    assert!(escaped.is_err());
    assert!(dir.path().join("modules/tv.example/module.sqlite.pre-v2").exists());
}
