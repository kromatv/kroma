use super::*;
use kroma_module_sdk::db::testing::TempPool;

fn test_pool() -> TempPool {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-db-test");
    {
        let conn = pool.get().unwrap();
        kroma_module_sdk::db::apply_migrations(&conn, MIGRATIONS).expect("indexers schema");
    }
    pool
}

#[test]
fn a_database_from_before_the_pace_table_gains_it_and_keeps_its_rows() {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-db-step");
    kroma_module_sdk::db::migrate_store(&pool, "t", MIGRATIONS, &[]).unwrap();
    insert_indexer(&pool, &row("a", 1)).unwrap();

    kroma_module_sdk::db::migrate_store(&pool, "t", MIGRATIONS, STEPS).unwrap();

    let conn = pool.get().unwrap();
    let paced: i64 = conn
        .query_row("SELECT COUNT(*) FROM indexer_pace", [], |r| r.get(0))
        .unwrap();
    assert_eq!(paced, 0);
    assert_eq!(list_indexers(&conn).unwrap().len(), 1);
}

#[test]
fn a_new_database_starts_with_the_pace_table() {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-db-fresh");

    kroma_module_sdk::db::migrate_store(&pool, "t", MIGRATIONS, STEPS).unwrap();

    let paced: i64 = pool
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM indexer_pace", [], |r| r.get(0))
        .unwrap();
    assert_eq!(paced, 0);
}

fn row(id: &str, created_at: i64) -> IndexerRow {
    IndexerRow {
        id: id.into(),
        name: format!("Indexer {id}"),
        url: "http://tracker.example".into(),
        api_key: "secret".into(),
        categories: vec![2000, 5000],
        enabled: true,
        priority: 0,
        kind: "torznab".into(),
        definition_id: None,
        settings: "{}".into(),
        last_ok_at: None,
        last_error: None,
        created_at,
    }
}

#[test]
fn insert_then_get_round_trips_all_fields() {
    let pool = test_pool();
    let mut r = row("a", 100);
    r.categories = vec![2040, 5030];
    r.priority = 7;
    r.kind = "builtin".into();
    r.definition_id = Some("thepiratebay".into());
    r.settings = r#"{"user":"bob"}"#.into();
    insert_indexer(&pool, &r).unwrap();

    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().expect("row present");
    assert_eq!(got.id, "a");
    assert_eq!(got.name, "Indexer a");
    assert_eq!(got.categories, vec![2040, 5030]);
    assert_eq!(got.priority, 7);
    assert!(got.enabled);
    assert_eq!(got.kind, "builtin");
    assert_eq!(got.definition_id.as_deref(), Some("thepiratebay"));
    assert_eq!(got.settings, r#"{"user":"bob"}"#);
    assert!(got.last_ok_at.is_none() && got.last_error.is_none());
}

#[test]
fn get_missing_returns_none() {
    let pool = test_pool();
    let conn = pool.get().unwrap();
    assert!(get_indexer(&conn, "nope").unwrap().is_none());
}

#[test]
fn list_is_ordered_by_created_at() {
    let pool = test_pool();
    insert_indexer(&pool, &row("late", 300)).unwrap();
    insert_indexer(&pool, &row("early", 100)).unwrap();
    insert_indexer(&pool, &row("mid", 200)).unwrap();
    let conn = pool.get().unwrap();
    let ids: Vec<String> = list_indexers(&conn)
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, vec!["early", "mid", "late"]);
}

#[test]
fn enabled_filters_disabled_and_orders_by_priority_desc() {
    let pool = test_pool();
    let mut hi = row("hi", 100);
    hi.priority = 10;
    let mut lo = row("lo", 200);
    lo.priority = 1;
    let mut off = row("off", 50);
    off.enabled = false;
    off.priority = 99;
    insert_indexer(&pool, &lo).unwrap();
    insert_indexer(&pool, &hi).unwrap();
    insert_indexer(&pool, &off).unwrap();

    let conn = pool.get().unwrap();
    let ids: Vec<String> = enabled_indexers(&conn)
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids, vec!["hi", "lo"]);
}

#[test]
fn update_is_partial_and_keeps_unspecified_fields() {
    let pool = test_pool();
    insert_indexer(&pool, &row("a", 100)).unwrap();

    let changed = update_indexer(
        &pool,
        "a",
        Some("Renamed"),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    assert!(changed);

    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().unwrap();
    assert_eq!(got.name, "Renamed");
    assert_eq!(got.api_key, "secret");
    assert_eq!(got.categories, vec![2000, 5000]);
    drop(conn);

    update_indexer(
        &pool,
        "a",
        None,
        Some("http://new.example"),
        Some("newkey"),
        Some(&[100, 200]),
        Some(false),
        Some(5),
        Some(r#"{"x":1}"#),
    )
    .unwrap();
    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().unwrap();
    assert_eq!(got.url, "http://new.example");
    assert_eq!(got.api_key, "newkey");
    assert_eq!(got.categories, vec![100, 200]);
    assert!(!got.enabled);
    assert_eq!(got.priority, 5);
    assert_eq!(got.settings, r#"{"x":1}"#);
}

#[test]
fn update_missing_row_returns_false() {
    let pool = test_pool();
    let changed = update_indexer(
        &pool,
        "ghost",
        Some("x"),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    assert!(!changed);
}

#[test]
fn a_write_the_database_refuses_surfaces_instead_of_reading_as_no_such_row() {
    let pool = test_pool();
    insert_indexer(&pool, &row("a", 100)).unwrap();
    pool.get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER refuse BEFORE UPDATE ON indexers \
                 BEGIN SELECT RAISE(ABORT, 'read only'); END",
        )
        .unwrap();

    let err = update_indexer(&pool, "a", Some("x"), None, None, None, None, None, None)
        .unwrap_err()
        .to_string();

    assert!(err.contains("read only"), "{err}");
}

#[test]
fn delete_removes_row_and_reports_hit_or_miss() {
    let pool = test_pool();
    insert_indexer(&pool, &row("a", 100)).unwrap();
    assert!(delete_indexer(&pool, "a").unwrap());
    assert!(!delete_indexer(&pool, "a").unwrap());
    let conn = pool.get().unwrap();
    assert!(get_indexer(&conn, "a").unwrap().is_none());
}

#[test]
fn note_result_sets_ok_then_error_independently() {
    let pool = test_pool();
    insert_indexer(&pool, &row("a", 100)).unwrap();

    note_indexer_result(&pool, "a", true, None, 1234).unwrap();
    {
        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert_eq!(got.last_ok_at, Some(1234));
        assert!(got.last_error.is_none());
    }

    note_indexer_result(&pool, "a", false, Some("timeout"), 9999).unwrap();
    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().unwrap();
    assert_eq!(got.last_ok_at, Some(1234));
    assert_eq!(got.last_error.as_deref(), Some("timeout"));
}

#[test]
fn categories_parsing_drops_blank_and_unparseable_entries() {
    let pool = test_pool();
    insert_indexer(&pool, &row("a", 100)).unwrap();
    {
        let conn = pool.get().unwrap();
        conn.execute(
            "UPDATE indexers SET categories = '2000, 5000 , junk, ' WHERE id = 'a'",
            [],
        )
        .unwrap();
    }
    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().unwrap();
    assert_eq!(got.categories, vec![2000, 5000]);
}

#[test]
fn empty_categories_round_trip_to_empty_vec() {
    let pool = test_pool();
    let mut r = row("a", 100);
    r.categories = vec![];
    insert_indexer(&pool, &r).unwrap();
    let conn = pool.get().unwrap();
    let got = get_indexer(&conn, "a").unwrap().unwrap();
    assert!(got.categories.is_empty());
}
