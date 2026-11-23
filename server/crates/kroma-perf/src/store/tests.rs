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

fn open_store() -> (kroma_testing::TempDir, Connection) {
    let dir = kroma_testing::temp_dir("perf-store");
    let connection = connect(&dir.path().join("perf.db")).unwrap();
    ensure_schema(&connection).unwrap();
    (dir, connection)
}

#[test]
fn an_hour_written_twice_by_one_boot_counts_once() {
    let (_dir, connection) = open_store();
    let tag = Tag {
        boot: "b1".into(),
        build: "1".into(),
    };

    write_hour(&connection, &hour_with(HOUR_MS, 2), &tag).unwrap();
    write_hour(&connection, &hour_with(HOUR_MS, 5), &tag).unwrap();

    let count: i64 = connection
        .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn hours_older_than_two_days_fold_into_one_day_per_build() {
    let (_dir, connection) = open_store();
    let now = 10 * DAY_MS;
    let tag = Tag {
        boot: "b1".into(),
        build: "1".into(),
    };
    write_hour(&connection, &hour_with(2 * DAY_MS, 1), &tag).unwrap();
    write_hour(&connection, &hour_with(2 * DAY_MS + HOUR_MS, 2), &tag).unwrap();
    write_hour(&connection, &hour_with(now - HOUR_MS, 4), &tag).unwrap();

    tidy(&connection, now).unwrap();

    let spans: Vec<(i64, i64)> = connection
        .prepare("SELECT start_ms, span_ms FROM history ORDER BY start_ms")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(spans, vec![(2 * DAY_MS, DAY_MS), (now - HOUR_MS, HOUR_MS)]);
}

#[test]
fn a_store_reads_back_what_it_kept() {
    let dir = kroma_testing::temp_dir("perf-store-read");
    let store = Store::open(&dir.path().join("perf.db"), "42").unwrap();
    let writer = connect(&dir.path().join("perf.db")).unwrap();
    let tag = Tag {
        boot: "b".into(),
        build: "42".into(),
    };
    write_hour(&writer, &hour_with(now_ms() - HOUR_MS, 3), &tag).unwrap();

    let read = store.read_since(now_ms() - DAY_MS).unwrap();

    assert_eq!(requests_in(&read), 3);
}

#[test]
fn a_file_from_another_schema_is_emptied() {
    let (dir, connection) = open_store();
    connection
        .execute_batch(
            "INSERT INTO catalog VALUES (1, 'sql', 'SELECT 1', NULL); PRAGMA user_version = 99;",
        )
        .unwrap();

    ensure_schema(&connect(&dir.path().join("perf.db")).unwrap()).unwrap();

    let count: i64 = connection
        .query_row("SELECT count(*) FROM catalog", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
}
