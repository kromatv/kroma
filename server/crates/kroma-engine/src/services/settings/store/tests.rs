use serde_json::json;

use super::*;
use crate::db::testing::TempPool;

fn test_pool() -> TempPool {
    crate::db::testing::temp_pool("settings-store")
}

#[test]
fn get_falls_back_to_default_then_null() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    assert_eq!(s.get("serverName"), json!("KROMA"));
    assert_eq!(s.get("totallyUnknown"), Value::Null);
}

#[test]
fn typed_getters_coerce_and_fall_back() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    assert!(s.get_bool("watchAutoScan", false));
    assert!(s.get_bool("anonStats", false));
    assert!(s.get_bool("missingBool", true));
    assert!(s.get_bool("serverName", true));
    assert_eq!(s.get_str("serverName", "x"), "KROMA");
    assert_eq!(s.get_str("anonStats", "fb"), "fb");
    assert_eq!(s.get_str("missingStr", "fb"), "fb");
    assert_eq!(s.get_i64("watchIntervalSecs", 99), -1);
    assert_eq!(s.get_i64("maxConcurrent", 0), 8);
    assert_eq!(s.get_i64("serverName", 42), 42);
    assert_eq!(s.get_i64("missingI64", 7), 7);
}

#[test]
fn set_patch_keeps_known_skips_unknown_and_persists() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    let mut patch = BTreeMap::new();
    patch.insert("serverName".to_string(), json!("MyBox"));
    patch.insert("bogusKey".to_string(), json!(123));
    let mut written = s.set_patch(&pool, patch);
    written.sort();
    assert_eq!(written, vec!["serverName".to_string()]);
    assert_eq!(s.get("serverName"), json!("MyBox"));
    assert_eq!(s.get("bogusKey"), Value::Null);
    let s2 = Settings::load(&pool);
    assert_eq!(s2.get("serverName"), json!("MyBox"));
}

#[test]
fn update_json_read_modify_writes_known_key_only() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    s.update_json(&pool, "watchIntervalSecs", |v| {
        json!(v.as_i64().unwrap_or(0) + 5)
    });
    assert_eq!(s.get_i64("watchIntervalSecs", 0), 4);
    assert_eq!(Settings::load(&pool).get_i64("watchIntervalSecs", 0), 4);
    s.update_json(&pool, "notAKey", |_| json!("x"));
    assert_eq!(s.get("notAKey"), Value::Null);
}

#[test]
fn reload_picks_up_direct_db_writes() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    assert_eq!(s.get("serverName"), json!("KROMA"));
    crate::db::settings_set(&pool, "serverName", &json!("Restored")).unwrap();
    s.reload(&pool);
    assert_eq!(s.get("serverName"), json!("Restored"));
}

#[test]
fn a_store_that_cannot_be_read_falls_back_to_the_built_in_defaults() {
    let pool = test_pool();
    crate::db::settings_set(&pool, "serverName", &json!("Stored")).unwrap();
    pool.get()
        .unwrap()
        .execute_batch("DROP TABLE settings")
        .unwrap();

    let s = Settings::load(&pool);
    assert_eq!(s.get("serverName"), json!("KROMA"));

    s.reload(&pool);
    assert_eq!(s.get("serverName"), json!("KROMA"));
}

#[test]
fn a_write_that_fails_reads_no_key_of_a_table_that_did_not_read() {
    let pool = test_pool();
    pool.get()
        .unwrap()
        .execute_batch("DROP TABLE settings")
        .unwrap();
    let s = Settings::load(&pool);

    let before = s.stored("libraries");
    let written = s.set_internal(&pool, "libraries", json!([]));
    s.update_json(&pool, "serverName", |_| json!("Renamed"));

    assert_eq!(before, None);
    assert!(written.is_err());
    assert_eq!(s.stored("libraries"), None);
    assert_eq!(s.stored("serverName"), None);
    assert_eq!(s.get("libraries"), json!([]));
}

#[test]
fn a_table_that_reads_again_is_read_the_next_time_a_key_is_asked_for() {
    let pool = test_pool();
    crate::db::settings_set(&pool, "serverName", &json!("Stored")).unwrap();
    let conn = pool.get().unwrap();
    conn.execute_batch("ALTER TABLE settings RENAME TO settings_away")
        .unwrap();
    let s = Settings::load(&pool);
    let during = (s.stored("serverName"), s.get("serverName"));
    conn.execute_batch("ALTER TABLE settings_away RENAME TO settings")
        .unwrap();

    let after = (s.get("serverName"), s.stored("serverName"));

    assert_eq!(during, (None, json!("KROMA")));
    assert_eq!(after, (json!("Stored"), Some(json!("Stored"))));
}

#[test]
fn a_stored_value_that_is_not_json_is_unread_until_it_is_written_again() {
    let pool = test_pool();
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO settings (key,value,updated_at) VALUES ('serverName','{','now')",
            [],
        )
        .unwrap();
    let s = Settings::load(&pool);

    let read = (s.stored("serverName"), s.stored("timezone").is_some());
    let answered = s.get("serverName");
    s.set_patch(
        &pool,
        BTreeMap::from([("serverName".to_string(), json!("Repaired"))]),
    );

    assert_eq!(read, (None, true));
    assert_eq!(answered, json!("KROMA"));
    assert_eq!(s.stored("serverName"), Some(json!("Repaired")));
    assert!(Settings::load(&pool).stored("serverName").is_some());
}

#[test]
fn cloned_handle_shares_the_same_map() {
    let pool = test_pool();
    let s = Settings::load(&pool);
    let clone = s.clone();
    s.set_patch(
        &pool,
        BTreeMap::from([("serverName".to_string(), json!("Shared"))]),
    );
    assert_eq!(clone.get("serverName"), json!("Shared"));
}

fn holding_a_library(pool: &TempPool) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO libraries (id,name,kind,path,added_at) \
             VALUES ('lib-owner','Films','movies','/a','t')",
            [],
        )
        .unwrap();
}

#[test]
fn no_writer_of_a_whole_value_saves_a_library_list_that_leaves_out_a_held_library() {
    let pool = test_pool();
    holding_a_library(&pool);
    let s = Settings::load(&pool);

    let patched = s.set_patch(
        &pool,
        BTreeMap::from([("libraries".to_string(), json!([]))]),
    );
    s.update_json(&pool, "libraries", |_| json!([{ "name": "Films" }]));
    let internal = s.set_internal(&pool, "libraries", Value::Null);

    assert!(patched.is_empty());
    assert!(internal.is_err());
    assert_eq!(s.get("libraries"), Value::Null);
    assert_eq!(Settings::load(&pool).stored("libraries"), Some(Value::Null));
}

#[test]
fn a_library_list_that_keeps_every_held_library_is_saved_by_each_writer() {
    let pool = test_pool();
    holding_a_library(&pool);
    let s = Settings::load(&pool);
    let keeping = json!([{ "id": "lib-owner", "name": "Films", "folders": ["/a"] }]);
    let patch = BTreeMap::from([("libraries".to_string(), keeping.clone())]);

    let patched = s.set_patch(&pool, patch);
    s.update_json(&pool, "libraries", |saved| saved);
    let internal = s.set_internal(&pool, "libraries", keeping.clone());

    assert_eq!(patched, ["libraries"]);
    assert!(internal.is_ok());
    assert_eq!(Settings::load(&pool).get("libraries"), keeping);
}
