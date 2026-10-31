use super::*;
use crate::services::network::flow::Verdict;

const AT_MS: i64 = 1_800_000_000_000;

fn report(purpose: &str, route: FlowRoute) -> FlowReport {
    FlowReport {
        purpose: purpose.to_string(),
        method: "GET".to_string(),
        host: "api.example".to_string(),
        port: 443,
        route,
        status: None,
        bytes_in: 0,
        bytes_out: 0,
        duration_ms: 0,
        error: None,
        rule: None,
    }
}

fn everything(limit: usize) -> FlowFilter {
    FlowFilter {
        limit,
        ..FlowFilter::default()
    }
}

#[test]
fn the_newest_flow_comes_first() {
    let journal = Journal::default();
    journal.record("core", report("first", FlowRoute::Direct), AT_MS);
    journal.record("core", report("second", FlowRoute::Direct), AT_MS + 1);

    let flows = journal.recent(&everything(10));

    let purposes: Vec<&str> = flows.iter().map(|f| f.purpose.as_str()).collect();
    assert_eq!(purposes, ["second", "first"]);
    assert!(flows[0].id > flows[1].id);
}

#[test]
fn the_oldest_flows_fall_off_past_capacity() {
    let journal = Journal::default();
    for i in 0..=RECENT_CAPACITY {
        journal.record(
            "core",
            report("metadata", FlowRoute::Direct),
            AT_MS + i as i64,
        );
    }

    let flows = journal.recent(&everything(usize::MAX));

    assert_eq!(flows.len(), RECENT_CAPACITY);
    assert_eq!(flows.last().unwrap().at, AT_MS + 1);
}

#[test]
fn every_filter_set_must_match() {
    let journal = Journal::default();
    journal.record("core", report("metadata", FlowRoute::Direct), AT_MS);
    journal.record("core", report("metadata", FlowRoute::Blocked), AT_MS);
    journal.record(
        "tv.kroma.indexer",
        report("indexer", FlowRoute::Blocked),
        AT_MS,
    );
    let filter = FlowFilter {
        limit: 10,
        caller: Some("core".to_string()),
        purpose: Some("metadata".to_string()),
        verdict: Some(Verdict::Blocked),
    };

    let flows = journal.recent(&filter);

    assert_eq!(flows.len(), 1);
    assert_eq!(flows[0].route, FlowRoute::Blocked);
}

#[test]
fn a_long_field_a_module_reports_is_clipped() {
    let journal = Journal::default();
    let long = FlowReport {
        host: "h".repeat(1000),
        error: Some("e".repeat(1000)),
        ..report(&"p".repeat(1000), FlowRoute::Direct)
    };

    journal.record("tv.kroma.indexer", long, AT_MS);

    let flow = &journal.recent(&everything(1))[0];
    assert_eq!(flow.purpose.len(), MAX_PURPOSE_CHARS);
    assert_eq!(flow.host.len(), MAX_HOST_CHARS);
    assert_eq!(flow.error.as_ref().unwrap().len(), MAX_ERROR_CHARS);
}

#[test]
fn a_flush_writes_one_tally_per_day_caller_purpose_host_and_route() {
    let pool = crate::db::testing::temp_pool("journal-flush");
    let journal = Journal::default();
    journal.record("core", report("metadata", FlowRoute::Direct), AT_MS);
    journal.record("core", report("metadata", FlowRoute::Direct), AT_MS + 5);
    journal.record("core", report("metadata", FlowRoute::Blocked), AT_MS);

    journal.flush(&pool).unwrap();
    journal.flush(&pool).unwrap();

    let tallies = network_flows::since(&pool, network_flows::day_of(AT_MS), 10).unwrap();
    let counts: Vec<(&str, &str, i64)> = tallies
        .iter()
        .map(|t| (t.route.as_str(), t.verdict.as_str(), t.count))
        .collect();
    assert_eq!(
        counts,
        [("direct", "allowed", 2), ("blocked", "blocked", 1)]
    );
    assert_eq!(tallies[0].last_at, AT_MS + 5);
}
