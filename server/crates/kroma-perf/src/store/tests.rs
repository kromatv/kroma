use super::*;
use crate::recent::ScopeKey;
use crate::scope::ScopeKind;
use crate::stats::Run;

fn hour_with(start_ms: i64, requests: u64) -> Bucket {
    let mut bucket = Bucket::starting(start_ms);
    let key = ScopeKey {
        kind: ScopeKind::Request,
        name: "GET /api/home".into(),
    };
    for _ in 0..requests {
        bucket.scopes.entry(key.clone()).or_default().record(&Run {
            elapsed_ns: 1_000_000,
            ..Run::default()
        });
    }
    bucket
}

fn requests_in(bucket: &Bucket) -> u64 {
    bucket.scopes.values().map(|s| s.timing.count).sum()
}

fn slow(id: u64, at_ms: i64) -> SlowRequest {
    SlowRequest {
        id,
        at_ms,
        name: "GET /api/admin/storage".into(),
        status: Some(200),
        total_us: 32_000_000,
        kinds: BTreeMap::new(),
        segments: 0,
        bytes: None,
        repeats: Vec::new(),
        events: Vec::new(),
        dropped_events: 0,
    }
}

fn open_connection() -> (kroma_testing::TempDir, Connection) {
    let dir = kroma_testing::temp_dir("perf-store");
    let connection = Connection::open(dir.path().join("perf.db")).unwrap();
    ensure_schema(&connection).unwrap();
    (dir, connection)
}

fn tag() -> Tag {
    Tag {
        boot: "b1".into(),
        build: "1".into(),
    }
}

#[test]
fn an_hour_written_twice_by_one_boot_counts_once() {
    let (_dir, connection) = open_connection();

    write_hour(&connection, &hour_with(HOUR_MS, 2), &tag()).unwrap();
    write_hour(&connection, &hour_with(HOUR_MS, 5), &tag()).unwrap();

    let count: i64 = connection
        .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn hours_older_than_two_days_fold_into_one_day_per_build() {
    let (_dir, connection) = open_connection();
    let now = 10 * DAY_MS;
    write_hour(&connection, &hour_with(2 * DAY_MS, 1), &tag()).unwrap();
    write_hour(&connection, &hour_with(2 * DAY_MS + HOUR_MS, 2), &tag()).unwrap();
    write_hour(&connection, &hour_with(now - HOUR_MS, 4), &tag()).unwrap();

    tidy(&connection, now).unwrap();
    write_hour(&connection, &hour_with(2 * DAY_MS + 2 * HOUR_MS, 8), &tag()).unwrap();
    tidy(&connection, now).unwrap();

    let rows: Vec<(i64, i64, String)> = connection
        .prepare("SELECT start_ms, span_ms, bucket FROM history ORDER BY start_ms")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let spans: Vec<(i64, i64)> = rows.iter().map(|(start, span, _)| (*start, *span)).collect();
    assert_eq!(spans, vec![(2 * DAY_MS, DAY_MS), (now - HOUR_MS, HOUR_MS)]);
    assert_eq!(requests_in(&serde_json::from_str(&rows[0].2).unwrap()), 11);
}

#[test]
fn a_store_reads_back_what_it_saved() {
    let dir = kroma_testing::temp_dir("perf-store-read");
    let store = Store::open(&dir.path().join("perf.db"), "42").unwrap();
    let name = Descriptor {
        kind: "sql".into(),
        label: "SELECT 1".into(),
        origin: Some("core".into()),
    };

    store
        .save(&Unsaved {
            hours: vec![hour_with(floor(now_ms(), HOUR_MS), 3)],
            slow: vec![slow(7, now_ms())],
            names: vec![(9, name.clone())],
        })
        .unwrap();

    assert_eq!(requests_in(&store.read_since(now_ms() - DAY_MS).unwrap()), 3);
    assert_eq!(store.slow_request(7).map(|r| r.total_us), Some(32_000_000));
    assert_eq!(store.slow_since(now_ms() - DAY_MS).unwrap().len(), 1);
    assert_eq!(store.names().unwrap(), vec![(9, name)]);
}

#[test]
fn nothing_to_save_writes_nothing() {
    let dir = kroma_testing::temp_dir("perf-store-empty");
    let store = Store::open(&dir.path().join("perf.db"), "42").unwrap();

    store.save(&Unsaved::default()).unwrap();

    assert!(store.read_since(0).unwrap().is_empty());
    assert!(store.slow_request(1).is_none());
}

#[test]
fn a_file_from_another_schema_is_emptied() {
    let (dir, connection) = open_connection();
    connection
        .execute_batch(
            "INSERT INTO catalog VALUES (1, 'sql', 'SELECT 1', NULL); PRAGMA user_version = 99;",
        )
        .unwrap();

    ensure_schema(&Connection::open(dir.path().join("perf.db")).unwrap()).unwrap();

    let count: i64 = connection
        .query_row("SELECT count(*) FROM catalog", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
}
