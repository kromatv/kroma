use kroma_module_host::{NetworkFlow, NetworkPolicy, NetworkRoute};

use super::*;

fn report(purpose: &str, route: FlowRoute) -> FlowReport {
    FlowReport {
        purpose: purpose.to_string(),
        method: "GET".to_string(),
        host: "api.example".to_string(),
        port: 443,
        route,
        status: Some(200),
        bytes_in: 1000,
        bytes_out: 10,
        duration_ms: 42,
        error: None,
        rule: None,
    }
}

#[test]
fn a_recorded_flow_reaches_the_journal_and_the_summary() {
    let (network, _pool) = network("network-journal", Point::absent(NETWORK_POINT));
    network.record(CORE, report("metadata", FlowRoute::Direct));
    network.record("tv.kroma.indexer", report("indexer", FlowRoute::Blocked));

    let summary = network.summary(7, None).unwrap();

    let blocked = network
        .flows(&FlowFilter {
            limit: 10,
            verdict: Some(Verdict::Blocked),
            ..FlowFilter::default()
        })
        .flows;
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].caller, "tv.kroma.indexer");
    assert_eq!(
        summary.totals,
        Totals {
            flows: 2,
            blocked: 1,
            bytes_in: 2000,
            bytes_out: 20
        }
    );
    assert_eq!(summary.rows.len(), 2);
}

#[test]
fn the_purposes_offered_include_the_cores_and_every_one_seen() {
    let (network, _pool) = network("network-purposes", Point::absent(NETWORK_POINT));
    network.record(
        "tv.kroma.torrents",
        report("peers-announce", FlowRoute::Vpn),
    );

    let purposes = network.purposes().unwrap();

    let seen = CallerPurpose {
        caller: "tv.kroma.torrents".to_string(),
        purpose: "peers-announce".to_string(),
    };
    let core = CallerPurpose {
        caller: CORE.to_string(),
        purpose: "metadata".to_string(),
    };
    assert!(purposes.contains(&seen));
    assert!(purposes.contains(&core));
    assert_eq!(purposes.len(), CORE_PURPOSES.len() + 1);
}

#[test]
fn flows_a_module_reports_are_journaled_under_that_module() {
    let (network, _pool) = network("network-module-flows", Point::absent(NETWORK_POINT));
    let flow = NetworkFlow {
        purpose: "torznab".to_string(),
        method: "GET".to_string(),
        host: "indexer.example".to_string(),
        port: 443,
        route: NetworkRoute::Proxy,
        status: Some(200),
        bytes_in: 5,
        bytes_out: 0,
        duration_ms: 3,
        error: None,
        rule: Some("all".to_string()),
        carried: false,
    };

    network.record_flows("tv.kroma.torznab", vec![flow]);

    let flows = network
        .flows(&FlowFilter {
            limit: 10,
            ..FlowFilter::default()
        })
        .flows;
    assert_eq!(flows[0].caller, "tv.kroma.torznab");
    assert_eq!(flows[0].route, FlowRoute::Vpn);
}

#[test]
fn a_report_of_a_carried_call_files_no_second_flow() {
    let (network, _pool) = network("network-carried", Point::absent(NETWORK_POINT));
    let flow = |carried: bool, method: &str, status: Option<u16>| NetworkFlow {
        purpose: "indexer".to_string(),
        method: method.to_string(),
        host: "tracker.example".to_string(),
        port: 443,
        route: NetworkRoute::Proxy,
        status,
        bytes_in: 10,
        bytes_out: 5,
        duration_ms: 1,
        error: None,
        rule: None,
        carried,
    };

    NetworkPolicy::record_flows(&network, "tv.kroma.indexer", vec![flow(false, CARRIED_METHOD, None)]);
    NetworkPolicy::record_flows(&network, "tv.kroma.indexer", vec![flow(true, "GET", Some(200))]);

    let page = network.flows(&FlowFilter {
        limit: 10,
        ..FlowFilter::default()
    });
    assert_eq!(page.total, 1);
    assert_eq!(page.flows[0].method, "GET");
    assert_eq!(page.flows[0].status, Some(200));
    assert_eq!(page.flows[0].bytes_in, 10);
}
