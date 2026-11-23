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

    profiler.record("fs", "stat", Some("/volume1"), Duration::from_millis(40));
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
        profiler.record(
            "sql",
            "SELECT id FROM files WHERE item_id = ?1",
            Some("core"),
            Duration::from_micros(80),
        );
    }

    profiler.finish(&scope, Some(200), None);

    let kept = profiler.slow_request(scope.id()).unwrap();
    assert_eq!(kept.name, "GET /api/admin/pipeline/show/{id}");
    assert_eq!(kept.events.len(), crate::slow::REPEATS_FLAGGED as usize);
    assert_eq!(kept.repeats[0].count, crate::slow::REPEATS_FLAGGED);
}

#[test]
fn a_finished_request_leaves_the_live_list() {
    let profiler = Profiler::new();
    let scope = profiler.request("GET", "/api/home").unwrap();
    let running = profiler.live().len();

    profiler.finish(&scope, Some(200), None);

    assert_eq!((running, profiler.live().len()), (1, 0));
}
