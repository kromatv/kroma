use super::*;

const AT_MS: i64 = 1_800_000_000_000;

fn arrival(address: &str, via: Via) -> Arrival {
    Arrival {
        address: address.to_string(),
        via,
        user_agent: "Kroma/1.0 (iPhone 17 Pro; iOS 26.0)".to_string(),
        bytes_in: 10,
        bytes_out: 100,
    }
}

#[test]
fn a_tunnel_header_wins_over_a_private_address() {
    assert_eq!(via_of("192.168.1.20", true, &[]), Via::Tunnel);
}

#[test]
fn a_private_address_is_the_lan_and_a_public_one_the_internet() {
    assert_eq!(via_of("192.168.1.20", false, &[]), Via::Lan);
    assert_eq!(via_of("8.8.8.8", false, &[]), Via::Internet);
}

#[test]
fn a_configured_local_network_is_the_lan() {
    let local = vec!["8.8.8.0/24".to_string()];

    assert_eq!(via_of("8.8.8.8", false, &local), Via::Lan);
}

#[test]
fn an_overlay_address_reads_as_a_vpn() {
    assert_eq!(via_of("100.101.102.103", false, &[]), Via::Vpn);
}

#[test]
fn requests_from_one_client_fold_into_one_row_with_their_bytes() {
    let pool = crate::db::testing::temp_pool("inbound-fold");
    let journal = InboundJournal::default();
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS);
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS + 5);

    journal.flush(&pool).unwrap();
    let summary = summarize(&pool, 1, AT_MS).unwrap();

    assert_eq!(summary.rows.len(), 1);
    assert_eq!(summary.rows[0].count, 2);
    assert_eq!(summary.rows[0].bytes_out, 200);
    assert_eq!(summary.rows[0].last_at, AT_MS + 5);
    assert_eq!(summary.totals.requests, 2);
    assert_eq!(summary.totals.addresses, 1);
}

#[test]
fn a_second_flush_adds_to_the_day_rather_than_replacing_it() {
    let pool = crate::db::testing::temp_pool("inbound-reflush");
    let journal = InboundJournal::default();
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS);
    journal.flush(&pool).unwrap();
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS + 5);

    journal.flush(&pool).unwrap();

    assert_eq!(summarize(&pool, 1, AT_MS).unwrap().totals.requests, 2);
}

#[test]
fn the_same_address_over_two_roads_is_two_rows() {
    let pool = crate::db::testing::temp_pool("inbound-roads");
    let journal = InboundJournal::default();
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS);
    journal.record(arrival("192.168.1.20", Via::Tunnel), AT_MS);

    journal.flush(&pool).unwrap();
    let summary = summarize(&pool, 1, AT_MS).unwrap();

    assert_eq!(summary.rows.len(), 2);
    assert_eq!(summary.totals.addresses, 1);
}

#[test]
fn a_summary_counts_only_the_days_asked_for() {
    let pool = crate::db::testing::temp_pool("inbound-window");
    let journal = InboundJournal::default();
    journal.record(arrival("192.168.1.20", Via::Lan), AT_MS - 2 * DAY_MS);
    journal.record(arrival("192.168.1.21", Via::Lan), AT_MS);
    journal.flush(&pool).unwrap();

    let summary = summarize(&pool, 1, AT_MS).unwrap();

    assert_eq!(summary.rows.len(), 1);
    assert_eq!(summary.rows[0].address, "192.168.1.21");
}
