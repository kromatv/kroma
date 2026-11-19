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
    let settings = Settings::load(pool);
    settings.set_patch(pool, BTreeMap::from([(LIBRARIES_KEY.to_string(), list)]));
    settings
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
fn the_error_tells_the_owner_that_no_library_was_changed() {
    let message = UnreadableLibraryList.to_string();

    assert!(message.contains("cannot be read"), "{message}");
    assert!(message.contains("no library was changed"), "{message}");
}
