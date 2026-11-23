use super::*;

#[test]
fn a_switched_off_profiler_opens_no_scope() {
    let profiler = Profiler::new();
    profiler.set_enabled(false);

    let scope = profiler.request("GET", "/api/home");

    assert!(scope.is_none());
}

#[test]
fn a_segment_recorded_inside_a_request_counts_in_both() {
    let profiler = Profiler::new();
    let scope = profiler.request("GET", "/api/shows/{id}").unwrap();
    let _entered = scope.enter();

    profiler.record(Measured {
        kind: "fs",
        label: "stat",
        origin: Some("/volume1"),
        elapsed: Duration::from_millis(40),
    });
    let finished = profiler.finish(&scope, Some(200), Some(10));

    assert_eq!(finished.kinds["fs"].count, 1);
    assert_eq!(finished.kinds["fs"].total_ns, 40_000_000);
    let hour = profiler.window(Window::Hour);
    let key = profiler.catalog.key_for("fs", "stat", Some("/volume1"));
    assert_eq!(hour.segments[&key].callers["GET /api/shows/{id}"], 1);
}

#[test]
fn a_request_looping_over_one_query_keeps_its_waterfall() {
    let profiler = Profiler::new();
    let scope = profiler
        .request("GET", "/api/admin/pipeline/show/{id}")
        .unwrap();
    let _entered = scope.enter();
    for _ in 0..crate::slow::REPEATS_FLAGGED {
        profiler.record(Measured {
            kind: "sql",
            label: "SELECT id FROM files WHERE item_id = ?1",
            origin: Some("core"),
            elapsed: Duration::from_micros(80),
        });
    }

    profiler.finish(&scope, Some(200), None);

    let kept = profiler.slow_request(scope.id()).unwrap();
    assert_eq!(kept.name, "GET /api/admin/pipeline/show/{id}");
    assert_eq!(kept.events.len(), crate::slow::REPEATS_FLAGGED as usize);
    assert_eq!(kept.repeats[0].count, crate::slow::REPEATS_FLAGGED);
}

#[test]
fn a_store_attached_after_a_restart_knows_the_names_saved_before() {
    let dir = kroma_testing::temp_dir("perf-attach");
    let path = dir.path().join("perf.db");
    let before = Profiler::new();
    before.attach(Store::open(&path, "1").unwrap());
    let key = before.catalog.key_for("sql", "SELECT 1", Some("core"));
    before.tick();

    let after = Profiler::new();
    after.attach(Store::open(&path, "1").unwrap());

    assert_eq!(
        after.describe(key).map(|name| name.label),
        Some("SELECT 1".into())
    );
}
