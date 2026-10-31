use super::*;

const NOW_MS: i64 = 1_800_000_000_000;

fn tally(day: i64, host: &str, count: i64) -> FlowTally {
    FlowTally {
        day,
        caller: "core".into(),
        purpose: "metadata".into(),
        host: host.into(),
        route: "direct".into(),
        verdict: "allowed".into(),
        count,
        bytes_in: count * 100,
        bytes_out: count * 10,
        last_at: NOW_MS + count,
    }
}

#[test]
fn a_delta_folds_into_its_days_row() {
    let pool = crate::testing::temp_pool("flows-fold");
    let today = day_of(NOW_MS);

    add(&pool, &[tally(today, "api.example", 2)]).unwrap();
    add(&pool, &[tally(today, "api.example", 3)]).unwrap();

    let rows = since(&pool, today, 10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(
        (rows[0].count, rows[0].bytes_in, rows[0].bytes_out),
        (5, 500, 50)
    );
    assert_eq!(rows[0].last_at, NOW_MS + 3);
}

#[test]
fn the_window_sums_its_days_and_leaves_older_ones_out() {
    let pool = crate::testing::temp_pool("flows-window");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[
            tally(today, "a.example", 1),
            tally(today - 1, "a.example", 2),
            tally(today - 9, "a.example", 40),
            tally(today, "b.example", 7),
        ],
    )
    .unwrap();

    let rows = since(&pool, today - 6, 10).unwrap();

    let summed: Vec<(&str, i64)> = rows.iter().map(|r| (r.host.as_str(), r.count)).collect();
    assert_eq!(summed, [("b.example", 7), ("a.example", 3)]);
}

#[test]
fn the_totals_count_every_flow_and_the_blocked_ones_apart() {
    let pool = crate::testing::temp_pool("flows-totals");
    let today = day_of(NOW_MS);
    let blocked = FlowTally {
        route: "blocked".into(),
        verdict: "blocked".into(),
        ..tally(today, "a.example", 2)
    };
    add(&pool, &[tally(today, "a.example", 3), blocked]).unwrap();

    let totals = totals_since(&pool, today).unwrap();

    assert_eq!(
        totals,
        FlowTotals {
            flows: 5,
            blocked: 2,
            bytes_in: 500,
            bytes_out: 50
        }
    );
}

#[test]
fn a_prune_drops_the_days_past_retention() {
    let pool = crate::testing::temp_pool("flows-prune");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[
            tally(today - RETENTION_DAYS - 1, "old.example", 1),
            tally(today - RETENTION_DAYS, "kept.example", 1),
        ],
    )
    .unwrap();

    let dropped = prune(&pool, NOW_MS).unwrap();

    assert_eq!(dropped, 1);
    let hosts: Vec<String> = since(&pool, 0, 10)
        .unwrap()
        .into_iter()
        .map(|r| r.host)
        .collect();
    assert_eq!(hosts, ["kept.example"]);
}

#[test]
fn the_purposes_seen_are_listed_once_each() {
    let pool = crate::testing::temp_pool("flows-purposes");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[tally(today, "a.example", 1), tally(today, "b.example", 1)],
    )
    .unwrap();

    let seen = purposes(&pool).unwrap();

    assert_eq!(seen, [("core".to_string(), "metadata".to_string())]);
}
