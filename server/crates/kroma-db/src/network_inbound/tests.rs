use super::*;

const NOW_MS: i64 = 1_800_000_000_000;

fn tally(day: i64, address: &str, count: i64, last_at: i64) -> InboundTally {
    InboundTally {
        day,
        address: address.into(),
        via: "lan".into(),
        user_agent: "Mozilla/5.0".into(),
        count,
        bytes_in: count * 10,
        bytes_out: count * 100,
        last_at,
    }
}

#[test]
fn a_delta_folds_into_its_days_row() {
    let pool = crate::testing::temp_pool("inbound-fold");
    let today = day_of(NOW_MS);

    add(&pool, &[tally(today, "192.168.1.2", 2, NOW_MS)]).unwrap();
    add(&pool, &[tally(today, "192.168.1.2", 3, NOW_MS + 1)]).unwrap();

    let rows = since(&pool, today, 10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].count, 5);
    assert_eq!(rows[0].bytes_out, 500);
    assert_eq!(rows[0].last_at, NOW_MS + 1);
}

#[test]
fn the_client_seen_last_comes_first() {
    let pool = crate::testing::temp_pool("inbound-order");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[
            tally(today, "192.168.1.2", 500, NOW_MS),
            tally(today, "192.168.1.3", 1, NOW_MS + 9),
        ],
    )
    .unwrap();

    let rows = since(&pool, today, 1).unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].address, "192.168.1.3");
}

#[test]
fn totals_count_each_address_once_across_days() {
    let pool = crate::testing::temp_pool("inbound-totals");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[
            tally(today - 1, "192.168.1.2", 1, NOW_MS),
            tally(today, "192.168.1.2", 1, NOW_MS),
            tally(today, "192.168.1.3", 1, NOW_MS),
        ],
    )
    .unwrap();

    let totals = totals_since(&pool, today - 1).unwrap();

    assert_eq!(totals.requests, 3);
    assert_eq!(totals.addresses, 2);
}

#[test]
fn prune_drops_only_the_days_past_retention() {
    let pool = crate::testing::temp_pool("inbound-prune");
    let today = day_of(NOW_MS);
    add(
        &pool,
        &[
            tally(today - RETENTION_DAYS - 1, "192.168.1.2", 1, NOW_MS),
            tally(today, "192.168.1.2", 1, NOW_MS),
        ],
    )
    .unwrap();

    let removed = prune(&pool, NOW_MS).unwrap();

    assert_eq!(removed, 1);
    assert_eq!(totals_since(&pool, 0).unwrap().requests, 1);
}
