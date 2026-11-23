use super::*;
use crate::flags::is_cold_outlier;
use crate::stats::{Part, Repeat, Run};
use std::collections::HashMap;

fn looping_run() -> Run {
    Run {
        elapsed_ns: 14_800_000_000,
        status: Some(200),
        bytes: Some(2 * 1024 * 1024),
        segments: 651,
        kinds: BTreeMap::from([(
            "sql",
            Part {
                count: 651,
                total_ns: 900_000_000,
            },
        )]),
        worst_repeat: Repeat { key: 5, count: 217 },
        parts: HashMap::from([(
            5,
            Part {
                count: 217,
                total_ns: 300_000_000,
            },
        )]),
    }
}

#[test]
fn a_route_running_one_query_per_episode_is_flagged() {
    let mut stats = ScopeStats::default();
    stats.record(&looping_run());
    let key = ScopeKey {
        kind: ScopeKind::Request,
        name: "GET /api/admin/pipeline/show/{id}".into(),
    };

    let row = scope_row(&key, &stats, &|k| Named {
        key: k.to_string(),
        ..Named::default()
    });

    assert_eq!(row.worst_repeat.as_ref().map(|r| r.count), Some(217));
    assert!(row.flags.contains(&Flag::NPlusOne));
    assert!(row.flags.contains(&Flag::SlowP95));
    assert!(row.flags.contains(&Flag::LargeResponse));
    assert_eq!(row.parts[0].per_call, 217.0);
}

#[test]
fn a_full_scan_is_flagged_per_call_not_in_total() {
    let mut stats = SegmentStats::default();
    let scan = crate::segment::Counters {
        full_scan_steps: 5_000,
        ..Default::default()
    };
    stats.record(2_000_000, &scan, "GET /api/people");

    let row = segment_row(
        Named {
            kind: "sql".into(),
            ..Named::default()
        },
        &stats,
    );

    assert_eq!(row.flags, vec![Flag::FullScan]);
    assert_eq!(row.callers[0].name, "GET /api/people");
}

#[test]
fn one_cold_call_among_fast_ones_reads_as_an_outlier() {
    let spread = Spread {
        p50_ms: 31.0,
        max_ms: 2_288.0,
        ..Spread::default()
    };

    assert!(is_cold_outlier(&spread));
    assert!(!is_cold_outlier(&Spread {
        p50_ms: 300.0,
        max_ms: 1_200.0,
        ..Spread::default()
    }));
}

#[test]
fn a_route_called_once_has_every_percentile_at_its_one_time() {
    let mut timing = Timing::default();
    timing.record(1_290_000_000);

    let spread = spread_of(&timing);

    assert_eq!(spread.p50_ms, 1_290.0);
    assert_eq!(spread.p99_ms, spread.max_ms);
}
