use std::collections::BTreeMap;
use std::path::PathBuf;

use serde_json::json;

use super::*;
use crate::config::Config;
use crate::db::testing::TempPool;
use crate::services::settings::{all_folders, library_defs};

fn pool() -> TempPool {
    crate::db::testing::temp_pool("library-list")
}

fn environment_naming_a_folder() -> Config {
    Config {
        movies_dirs: vec![PathBuf::from("/media/films")],
        ..Default::default()
    }
}

fn saved(pool: &TempPool, list: Value) -> Settings {
    crate::db::settings_set(pool, LIBRARIES_KEY, &list).unwrap();
    Settings::load(pool)
}

#[test]
fn a_null_value_is_no_saved_list() {
    let read = library_list(&Value::Null);

    assert_eq!(read.map(|list| list.is_none()), Ok(true));
}

#[test]
fn a_list_of_definitions_reads_as_that_list() {
    let one = json!([{ "id": "lib-1", "name": "Films", "folders": ["/a"] }]);

    let read = library_list(&one).unwrap().unwrap();

    assert_eq!(read.len(), 1);
    assert_eq!(read[0].id, "lib-1");
}

#[test]
fn a_value_that_is_not_a_list_of_definitions_cannot_be_read() {
    let not_lists = [
        json!([1, 2, 3]),
        json!([{ "name": "Films" }]),
        json!("films"),
        json!({ "id": "lib-1" }),
    ];

    for value in not_lists {
        assert_eq!(
            library_list(&value).map(|list| list.is_some()),
            Err(UnreadableLibraryList),
            "{value}"
        );
    }
}

#[test]
fn a_saved_list_that_cannot_be_read_never_falls_back_to_the_environment() {
    let pool = pool();
    let settings = saved(&pool, json!([{ "name": "Films" }]));
    let environment = environment_naming_a_folder();

    let read = library_defs(&settings, &environment);

    assert_eq!(read.map(|defs| defs.len()), Err(UnreadableLibraryList));
    assert!(all_folders(&settings, &environment).is_empty());
}

#[test]
fn a_saved_list_whose_row_is_not_json_cannot_be_read() {
    let pool = pool();
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO settings (key,value,updated_at) VALUES ('libraries','[{','now')",
            [],
        )
        .unwrap();
    let settings = Settings::load(&pool);

    let read = library_defs(&settings, &environment_naming_a_folder());

    assert_eq!(read.map(|defs| defs.len()), Err(UnreadableLibraryList));
}

#[test]
fn a_settings_table_that_did_not_read_leaves_the_list_unknown() {
    let pool = pool();
    pool.get()
        .unwrap()
        .execute_batch("DROP TABLE settings")
        .unwrap();
    let settings = Settings::load(&pool);

    let read = stored_library_defs(&settings);

    assert_eq!(read.map(|list| list.is_some()), Err(UnreadableLibraryList));
}

#[test]
fn with_no_saved_list_the_environment_seeds_one() {
    let pool = pool();
    let settings = Settings::load(&pool);

    let saved_list = stored_library_defs(&settings).map(|list| list.is_none());
    let seeded = library_defs(&settings, &environment_naming_a_folder()).unwrap();

    assert_eq!(saved_list, Ok(true));
    assert_eq!(seeded.len(), 1);
}

#[test]
fn a_list_the_table_holds_is_read_once_the_table_reads_again() {
    let pool = pool();
    let list = json!([{ "id": "lib-1", "name": "Films", "folders": ["/a"] }]);
    crate::db::settings_set(&pool, LIBRARIES_KEY, &list).unwrap();
    pool.get()
        .unwrap()
        .execute_batch("ALTER TABLE settings RENAME TO settings_away")
        .unwrap();
    let settings = Settings::load(&pool);
    pool.get()
        .unwrap()
        .execute_batch("ALTER TABLE settings_away RENAME TO settings")
        .unwrap();
    let stored: String = pool
        .get()
        .unwrap()
        .query_row(
            "SELECT value FROM settings WHERE key = 'libraries'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    let read = stored_library_defs(&settings);

    assert_eq!(stored, list.to_string());
    assert_eq!(read.map(|list| list.map(|defs| defs.len())), Ok(Some(1)));
}

#[test]
fn a_null_saved_while_the_table_does_not_read_does_not_hide_the_list_it_holds() {
    let pool = pool();
    let list = json!([{ "id": "lib-1", "name": "Films", "folders": ["/a"] }]);
    crate::db::settings_set(&pool, LIBRARIES_KEY, &list).unwrap();
    pool.get()
        .unwrap()
        .execute_batch("ALTER TABLE settings RENAME TO settings_away")
        .unwrap();
    let settings = Settings::load(&pool);
    settings.set_patch(
        &pool,
        BTreeMap::from([(LIBRARIES_KEY.to_string(), Value::Null)]),
    );
    pool.get()
        .unwrap()
        .execute_batch("ALTER TABLE settings_away RENAME TO settings")
        .unwrap();

    let read = library_defs(&settings, &environment_naming_a_folder());

    let ids: Vec<String> = read
        .unwrap_or_default()
        .into_iter()
        .map(|def| def.id)
        .collect();
    assert_eq!(ids, vec!["lib-1".to_string()]);
}

#[test]
fn the_error_says_what_cannot_be_read() {
    let message = UnreadableLibraryList.to_string();

    assert_eq!(message, "the saved library list cannot be read");
}
