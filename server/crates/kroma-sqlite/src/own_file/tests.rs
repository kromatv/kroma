use std::os::unix::fs::symlink;

use super::*;

fn victim(dir: &Path) -> PathBuf {
    let target = dir.join("victim.sqlite");
    Connection::open(&target)
        .unwrap()
        .execute_batch("CREATE TABLE secret (id INTEGER); INSERT INTO secret VALUES (1);")
        .unwrap();
    target
}

fn tables(path: &Path) -> Vec<String> {
    Connection::open(path)
        .unwrap()
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

#[test]
fn a_database_is_created_where_it_is_named() {
    let dir = kroma_testing::temp_dir("owned-created");
    let path = dir.path().join("module.sqlite");

    let conn = open_owned(&path).unwrap();
    conn.execute_batch("CREATE TABLE mine (id INTEGER)").unwrap();

    assert_eq!(tables(&path), ["mine"]);
}

#[test]
fn a_folder_reached_through_a_link_still_opens() {
    let dir = kroma_testing::temp_dir("owned-folder-link");
    let real = dir.path().join("volume");
    std::fs::create_dir_all(&real).unwrap();
    symlink(&real, dir.path().join("var")).unwrap();

    let opened = open_owned(&dir.path().join("var/module.sqlite"));

    assert!(opened.is_ok(), "{:#}", opened.err().unwrap());
    assert!(real.join("module.sqlite").is_file());
}

#[test]
fn a_link_named_like_the_database_is_refused_and_its_target_left_alone() {
    let dir = kroma_testing::temp_dir("owned-link");
    let target = victim(dir.path());
    let own = dir.path().join("own");
    std::fs::create_dir_all(&own).unwrap();
    symlink("../victim.sqlite", own.join("module.sqlite")).unwrap();

    let opened = open_owned(&own.join("module.sqlite"));

    assert!(opened.is_err());
    assert_eq!(tables(&target), ["secret"]);
}

#[test]
fn a_link_named_like_a_journal_is_refused() {
    for suffix in JOURNALS {
        let dir = kroma_testing::temp_dir("owned-journal-link");
        let target = dir.path().join("elsewhere");
        std::fs::write(&target, "untouched").unwrap();
        let database = dir.path().join("module.sqlite");
        symlink("elsewhere", journal_of(&database, suffix)).unwrap();

        let opened = open_owned(&database);

        assert!(opened.is_err(), "{suffix}");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "untouched");
        assert!(!database.exists(), "{suffix}");
    }
}

#[test]
fn a_file_with_a_second_name_is_refused() {
    let dir = kroma_testing::temp_dir("owned-hard-link");
    let target = victim(dir.path());
    std::fs::hard_link(&target, dir.path().join("module.sqlite")).unwrap();

    let opened = open_owned(&dir.path().join("module.sqlite"));

    assert!(opened.is_err());
}

#[test]
fn a_folder_named_like_the_database_is_refused() {
    let dir = kroma_testing::temp_dir("owned-folder");
    std::fs::create_dir_all(dir.path().join("module.sqlite")).unwrap();

    let opened = open_owned(&dir.path().join("module.sqlite"));

    assert!(opened.is_err());
}

#[test]
fn a_guarded_pool_opens_no_link() {
    let dir = kroma_testing::temp_dir("owned-guarded-link");
    let target = victim(dir.path());
    let own = dir.path().join("own");
    std::fs::create_dir_all(&own).unwrap();
    symlink("../victim.sqlite", own.join("module.sqlite")).unwrap();

    let pool = crate::open_guarded(&own.join("module.sqlite"), "tv.example.own");

    assert!(pool.is_err());
    assert_eq!(tables(&target), ["secret"]);
}
