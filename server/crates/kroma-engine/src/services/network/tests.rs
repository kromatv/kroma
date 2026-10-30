use serde_json::json;

use kroma_module_host::{NetworkAction, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkRoute};

use super::*;
use crate::db::testing::{TempPool, temp_pool};

fn network(tag: &str, vpn: Point) -> (Network, TempPool) {
    let pool = temp_pool(tag);
    let settings = Settings::load(&pool);
    (Network::new((*pool).clone(), settings, vpn), pool)
}

fn target(host: &str) -> WebTarget {
    WebTarget {
        https: true,
        host: host.to_string(),
        port: 443,
    }
}

fn everything(action: &str) -> NetworkRules {
    serde_json::from_value(json!({
        "defaultAction": "allow",
        "rules": [{ "id": "all", "action": action }]
    }))
    .unwrap()
}

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
fn a_vpn_rule_sends_the_call_through_the_proxy_the_vpn_names() {
    let vpn = Point::stub(VPN_POINT, |_, _| {
        Some(json!("socks5://kroma:pw@127.0.0.1:25345"))
    });
    let (network, _pool) = network("network-vpn", vpn);
    network.set_rules(everything("vpn")).unwrap();

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling,
        Ruling {
            decision: Decision::Proxy("socks5://kroma:pw@127.0.0.1:25345".to_string()),
            rule: Some("all".to_string())
        }
    );
}

#[test]
fn a_vpn_rule_refuses_the_call_while_no_vpn_answers() {
    let (network, _pool) = network("network-vpn-down", Point::absent(VPN_POINT));
    network.set_rules(everything("vpn")).unwrap();

    let ruling = network.rule_on(CORE, "metadata", &target("api.themoviedb.org"));

    assert_eq!(ruling.decision, Decision::Block(VPN_DOWN.to_string()));
}

#[test]
fn a_block_names_the_rule_or_the_guard_that_refused() {
    let (network, _pool) = network("network-block", Point::absent(VPN_POINT));
    network.set_rules(everything("block")).unwrap();

    let by_rule = network.rule_on(CORE, "stats", &target("stats.kroma.tv"));
    let by_guard = network.rule_on("tv.kroma.roku", "roku", &target("127.0.0.1"));

    assert_eq!(by_rule.decision, Decision::Block("rule all".to_string()));
    assert_eq!(by_guard.rule.as_deref(), Some(GUARD_LOOPBACK));
}

#[test]
fn stored_rules_read_back_with_their_hosts_normalised() {
    let (network, _pool) = network("network-rules", Point::absent(VPN_POINT));
    let rules: NetworkRules = serde_json::from_value(json!({
        "defaultAction": "block",
        "rules": [{ "id": "tmdb", "host": "API.TheMovieDB.org", "action": "direct" }]
    }))
    .unwrap();

    network.set_rules(rules).unwrap();

    let stored = network.rules();
    assert_eq!(stored.default_action, DefaultAction::Block);
    assert_eq!(stored.rules[0].host.as_deref(), Some("api.themoviedb.org"));
}

#[test]
fn invalid_rules_are_refused_and_the_stored_ones_stay() {
    let (network, _pool) = network("network-invalid", Point::absent(VPN_POINT));
    let invalid = everything("block");
    let invalid = NetworkRules {
        rules: vec![invalid.rules[0].clone(), invalid.rules[0].clone()],
        ..invalid
    };

    let refused = network.set_rules(invalid);

    assert!(matches!(
        refused,
        Err(RulesWriteError::Invalid(RulesError::DuplicateId(_)))
    ));
    assert_eq!(network.rules(), NetworkRules::default());
}

#[test]
fn a_recorded_flow_reaches_the_journal_and_the_summary() {
    let (network, _pool) = network("network-journal", Point::absent(VPN_POINT));
    network.record(CORE, report("metadata", FlowRoute::Direct));
    network.record("tv.kroma.indexer", report("indexer", FlowRoute::Blocked));

    let summary = network.summary(7).unwrap();

    let blocked = network.flows(&FlowFilter {
        limit: 10,
        verdict: Some(Verdict::Blocked),
        ..FlowFilter::default()
    });
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
    let (network, _pool) = network("network-purposes", Point::absent(VPN_POINT));
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

fn ask(host: &str) -> NetworkAsk {
    NetworkAsk {
        purpose: "download-client".to_string(),
        method: "POST".to_string(),
        host: host.to_string(),
        port: 8080,
        https: false,
    }
}

#[test]
fn a_module_asking_for_loopback_is_refused_with_the_reason() {
    let (network, _pool) = network("network-ask-loopback", Point::absent(VPN_POINT));

    let answer = NetworkPolicy::decide(&network, "tv.kroma.engine.qbittorrent", &ask("127.0.0.1"));

    assert_eq!(answer.action, NetworkAction::Block);
    assert_eq!(answer.rule.as_deref(), Some(GUARD_LOOPBACK));
    assert!(answer.reason.unwrap().contains("loopback"));
}

#[test]
fn a_module_routed_to_the_vpn_is_handed_its_proxy() {
    let vpn = Point::stub(VPN_POINT, |_, _| {
        Some(json!("socks5://kroma:pw@127.0.0.1:25345"))
    });
    let (network, _pool) = network("network-ask-vpn", vpn);
    network.set_rules(everything("vpn")).unwrap();

    let answer = NetworkPolicy::decide(&network, "tv.kroma.indexer", &ask("tracker.example"));

    assert_eq!(answer.action, NetworkAction::Vpn);
    assert_eq!(
        answer.proxy.as_deref(),
        Some("socks5://kroma:pw@127.0.0.1:25345")
    );
}

#[test]
fn flows_a_module_reports_are_journaled_under_that_module() {
    let (network, _pool) = network("network-module-flows", Point::absent(VPN_POINT));
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
    };

    network.record_flows("tv.kroma.torznab", vec![flow]);

    let flows = network.flows(&FlowFilter {
        limit: 10,
        ..FlowFilter::default()
    });
    assert_eq!(flows[0].caller, "tv.kroma.torznab");
    assert_eq!(flows[0].route, FlowRoute::Vpn);
}
