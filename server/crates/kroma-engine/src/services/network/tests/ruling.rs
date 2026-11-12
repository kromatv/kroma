use super::*;

fn target(host: &str) -> WebTarget {
    WebTarget {
        https: true,
        host: host.to_string(),
        port: 443,
    }
}

fn routed(rules: serde_json::Value) -> NetworkRules {
    serde_json::from_value(rules).unwrap()
}

#[test]
fn a_vpn_rule_sends_the_call_through_the_proxy_the_vpn_names() {
    let vpn = offering(vec![offer("vpn", "127.0.0.1:25345", true)]);
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
    let (network, _pool) = network("network-vpn-down", Point::absent(NETWORK_POINT));
    network.set_rules(everything("vpn")).unwrap();

    let ruling = network.rule_on(CORE, "metadata", &target("api.themoviedb.org"));

    assert_eq!(ruling.decision, Decision::Block("the network vpn is not running".to_string()));
}

fn listening(listens: serde_json::Value) -> DeclaredListeners {
    let listens: Vec<kroma_module_manifest::Listen> = serde_json::from_value(listens).unwrap();
    Arc::new(move || listens.clone())
}

#[test]
fn a_block_names_the_rule_or_the_guard_that_refused() {
    let (network, _pool) = network("network-block", Point::absent(NETWORK_POINT));
    let network = network.with_listeners(listening(json!([
        { "purpose": "proxy", "port": "setting:vpnLocalPort" }
    ])));
    network.set_rules(everything("block")).unwrap();

    let by_rule = network.rule_on(CORE, "stats", &target("stats.kroma.tv"));
    let bridge = WebTarget {
        port: 25345,
        ..target("127.0.0.1")
    };
    let by_guard = network.rule_on("tv.kroma.roku", "roku", &bridge);

    assert_eq!(by_rule.decision, Decision::Block("rule all".to_string()));
    assert_eq!(by_guard.rule.as_deref(), Some(GUARD_LOOPBACK));
}

#[test]
fn stored_rules_read_back_with_their_hosts_normalised() {
    let (network, _pool) = network("network-rules", Point::absent(NETWORK_POINT));
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
    let (network, _pool) = network("network-invalid", Point::absent(NETWORK_POINT));
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
fn two_networks_are_routed_to_by_different_rules() {
    let networks = offering(vec![
        offer("vpn-ch", "127.0.0.1:1000", true),
        offer("vpn-se", "127.0.0.1:2000", true),
    ]);
    let (network, _pool) = network("network-two", networks);
    network
        .set_rules(routed(json!({
            "defaultAction": "allow",
            "rules": [
                { "id": "a", "caller": "tv.kroma.torrents", "action": "vpn-ch" },
                { "id": "b", "caller": "tv.kroma.indexer", "action": "vpn-se" }
            ]
        })))
        .unwrap();

    let torrents = network.rule_on("tv.kroma.torrents", "peers", &target("tracker.example"));
    let indexer = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        torrents.decision,
        Decision::Proxy("socks5://kroma:pw@127.0.0.1:1000".to_string())
    );
    assert_eq!(
        indexer.decision,
        Decision::Proxy("socks5://kroma:pw@127.0.0.1:2000".to_string())
    );
}

#[test]
fn a_rule_naming_a_network_that_is_down_refuses_and_never_goes_direct() {
    let networks = offering(vec![offer("vpn-ch", "127.0.0.1:1000", false)]);
    let (network, _pool) = network("network-down", networks);
    network.set_rules(everything("vpn-ch")).unwrap();

    let ruling = network.rule_on("tv.kroma.torrents", "peers", &target("tracker.example"));

    assert_eq!(
        ruling.decision,
        Decision::Block("the network vpn-ch is not running".to_string())
    );
}

#[test]
fn a_rule_naming_a_network_nobody_offers_refuses() {
    let (network, _pool) = network("network-unknown", offering(Vec::new()));
    network.set_rules(everything("tor")).unwrap();

    let ruling = network.rule_on("tv.kroma.torrents", "peers", &target("tracker.example"));

    assert_eq!(
        ruling.decision,
        Decision::Block("the network tor is not running".to_string())
    );
}

#[test]
fn a_rule_can_match_on_a_port_and_an_address_range() {
    let networks = offering(vec![offer("vpn", "127.0.0.1:1000", true)]);
    let (network, _pool) = network("network-match", networks);
    network
        .set_rules(routed(json!({
            "defaultAction": "allow",
            "rules": [
                { "id": "a", "port": 6881, "action": "block" },
                { "id": "b", "address": "203.0.113.0/24", "action": "vpn" }
            ]
        })))
        .unwrap();
    let at = |host: &str, port: u16| WebTarget {
        https: false,
        host: host.to_string(),
        port,
    };

    let on_the_port = network.rule_on("m", "p", &at("tracker.example", 6881));
    let in_the_range = network.rule_on("m", "p", &at("203.0.113.9", 80));
    let outside_it = network.rule_on("m", "p", &at("198.51.100.9", 80));
    let a_name = network.rule_on("m", "p", &at("tracker.example", 80));

    assert_eq!(on_the_port.rule.as_deref(), Some("a"));
    assert_eq!(in_the_range.rule.as_deref(), Some("b"));
    assert_eq!(outside_it.rule, None);
    assert_eq!(a_name.rule, None);
}

#[test]
fn every_port_a_module_declares_it_listens_on_is_refused_to_another_module() {
    let (network, _pool) = network("network-listeners", Point::absent(NETWORK_POINT));
    let network = network.with_listeners(listening(json!([
        { "purpose": "proxy", "port": "setting:vpnLocalPort", "count": 5 }
    ])));
    let at = |port: u16| WebTarget {
        port,
        ..target("127.0.0.1")
    };

    let last = network.rule_on("tv.kroma.roku", "roku", &at(25349));
    let after = network.rule_on("tv.kroma.roku", "roku", &at(25350));

    assert_eq!(last.rule.as_deref(), Some(GUARD_LOOPBACK));
    assert_eq!(after.decision, Decision::Direct);
}

#[test]
fn the_core_still_reaches_a_port_a_module_listens_on() {
    let (network, _pool) = network("network-listeners-core", Point::absent(NETWORK_POINT));
    let network = network.with_listeners(listening(json!([
        { "purpose": "proxy", "port": "setting:vpnLocalPort", "count": 5 }
    ])));
    let bridge = WebTarget {
        port: 25346,
        ..target("127.0.0.1")
    };

    let ruling = network.rule_on(CORE, "proxy", &bridge);

    assert_eq!(ruling.decision, Decision::Direct);
}
