use super::*;
use crate::profiler::Window;

fn traced_connection() -> rusqlite::Connection {
    install();
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    connection.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO t (name) VALUES ('a'), ('b'), ('c');").unwrap();
    connection
}

fn sql_key(label: &str) -> u64 {
    profiler().catalog.key_for("sql", label, Some("memory"))
}

#[test]
fn a_statement_run_in_a_scope_is_counted_with_its_rows() {
    let connection = traced_connection();
    let scope = profiler().request("GET", "/test/hook-rows").unwrap();
    let _entered = scope.enter();

    let names: Vec<String> = connection
        .prepare("SELECT name FROM t WHERE id > ?1 ORDER BY name")
        .unwrap()
        .query_map([0], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(names.len(), 3);
    let stats = &profiler().window(Window::Hour).segments
        [&sql_key("SELECT name FROM t WHERE id > ?1 ORDER BY name")];
    assert_eq!(stats.counters.rows, 3);
    assert_eq!(stats.callers["GET /test/hook-rows"], 1);
}

#[test]
fn a_scan_without_an_index_is_counted_as_one() {
    let connection = traced_connection();

    connection
        .query_row(
            "SELECT count(*) AS scanned FROM t WHERE name = 'b'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap();

    let stats = &profiler().window(Window::Hour).segments
        [&sql_key("SELECT count(*) AS scanned FROM t WHERE name = 'b'")];
    assert!(stats.counters.full_scan_steps > 0, "{stats:?}");
}

#[test]
fn the_same_query_for_different_list_lengths_is_one_entry() {
    let connection = traced_connection();

    connection
        .query_row(
            "SELECT count(*) FROM t WHERE id IN (?1, ?2) AND 1 = 1",
            [1, 2],
            |r| r.get::<_, i64>(0),
        )
        .unwrap();
    connection
        .query_row(
            "SELECT count(*) FROM t WHERE id IN (?1, ?2, ?3) AND 1 = 1",
            [1, 2, 3],
            |r| r.get::<_, i64>(0),
        )
        .unwrap();

    let stats = &profiler().window(Window::Hour).segments
        [&sql_key("SELECT count(*) FROM t WHERE id IN (?…) AND 1 = 1")];
    assert_eq!(stats.timing.count, 2);
}

#[test]
fn an_ignored_database_is_never_traced() {
    install();
    let dir = kroma_testing::temp_dir("perf-hook-ignored");
    let path = dir.path().join("quiet.db");
    ignore_database(&path);
    let connection = rusqlite::Connection::open(&path).unwrap();

    connection
        .execute_batch("CREATE TABLE quiet_marker (x)")
        .unwrap();

    let key = profiler()
        .catalog
        .key_for("sql", "CREATE TABLE quiet_marker (x)", Some("quiet"));
    assert!(!profiler().window(Window::Hour).segments.contains_key(&key));
}
