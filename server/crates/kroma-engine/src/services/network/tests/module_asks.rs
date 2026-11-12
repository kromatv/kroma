use kroma_module_host::{NetworkAction, NetworkAsk, NetworkPolicy};

use super::*;

fn ask(host: &str) -> NetworkAsk {
    ask_at(host, 8080)
}

fn ask_at(host: &str, port: u16) -> NetworkAsk {
    NetworkAsk {
        purpose: "download-client".to_string(),
        method: "POST".to_string(),
        host: host.to_string(),
        port,
        https: false,
        sealed: false,
    }
}

fn sealed(host: &str) -> NetworkAsk {
    NetworkAsk {
        sealed: true,
        ..ask(host)
    }
}

fn declaring(tag: &str, connect: serde_json::Value) -> (Network, TempPool) {
    let (network, pool) = network(tag, Point::absent(NETWORK_POINT));
    let permissions: kroma_module_manifest::Permissions =
        serde_json::from_value(json!({ "net": { "connect": connect } })).unwrap();
    let network = network.with_declared(Arc::new(move |_| Some(permissions.clone())));
    (network, pool)
}

#[test]
fn a_module_asking_for_one_of_this_servers_ports_is_refused_with_the_reason() {
    let (network, _pool) = network("network-ask-loopback", Point::absent(NETWORK_POINT));
    let bridge: Vec<kroma_module_manifest::Listen> =
        serde_json::from_value(json!([{ "purpose": "proxy", "port": "setting:vpnLocalPort" }]))
            .unwrap();
    let network = network
        .with_core_ports(4040, None)
        .with_listeners(Arc::new(move || bridge.clone()));

    for port in [4040, 4443, 25345] {
        let answer = NetworkPolicy::decide(
            &network,
            "tv.kroma.engine.qbittorrent",
            &ask_at("localhost", port),
        );

        assert_eq!(answer.action, NetworkAction::Block, "{port}");
        assert_eq!(answer.rule.as_deref(), Some(GUARD_LOOPBACK), "{port}");
        assert!(answer.reason.unwrap().contains("loopback"), "{port}");
    }
}

#[test]
fn a_download_client_on_this_machine_is_reachable() {
    let (network, _pool) = network("network-ask-local-client", Point::absent(NETWORK_POINT));
    let network = network.with_core_ports(4040, None);

    let answer = NetworkPolicy::decide(&network, "tv.kroma.engine.qbittorrent", &ask("127.0.0.1"));

    assert_eq!(answer.action, NetworkAction::Direct);
}

#[test]
fn a_module_routed_to_the_vpn_is_handed_its_proxy() {
    let vpn = offering(vec![offer("vpn", "127.0.0.1:25345", true)]);
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
fn a_sealed_call_takes_the_vpn_when_the_rules_would_send_it_direct() {
    let vpn = offering(vec![offer("vpn", "127.0.0.1:25345", true)]);
    let (network, _pool) = network("network-sealed-vpn", vpn);

    let answer = NetworkPolicy::decide(&network, "tv.kroma.torrents", &sealed("tracker.example"));

    assert_eq!(answer.action, NetworkAction::Vpn);
    assert_eq!(
        answer.proxy.as_deref(),
        Some("socks5://kroma:pw@127.0.0.1:25345")
    );
}

#[test]
fn a_sealed_call_is_refused_while_no_vpn_answers() {
    let (network, _pool) = network("network-sealed-down", Point::absent(NETWORK_POINT));

    let answer = NetworkPolicy::decide(&network, "tv.kroma.torrents", &sealed("tracker.example"));

    assert_eq!(answer.action, NetworkAction::Block);
    assert_eq!(answer.reason.as_deref(), Some(NO_NETWORK));
}

#[test]
fn a_sealed_call_to_the_local_network_stays_on_it() {
    let (network, _pool) = network("network-sealed-local", Point::absent(NETWORK_POINT));

    let answer = NetworkPolicy::decide(&network, "tv.kroma.torrents", &sealed("nas"));

    assert_eq!(answer.action, NetworkAction::Direct);
}

#[test]
fn a_call_only_public_covers_may_not_resolve_to_a_private_address() {
    let (network, _pool) = declaring(
        "network-reach-public",
        json!([{ "purpose": "download-client", "to": ["public"] }]),
    );

    let answer = NetworkPolicy::decide(&network, "tv.kroma.module", &ask("tracker.example"));

    assert_eq!(answer.action, NetworkAction::Direct);
    assert!(!answer.private_allowed);
}

#[test]
fn a_call_to_a_host_someone_named_may_resolve_to_a_private_address() {
    let (network, _pool) = declaring(
        "network-reach-named",
        json!([{ "purpose": "download-client", "to": ["client.example"] }]),
    );

    let answer = NetworkPolicy::decide(&network, "tv.kroma.module", &ask("client.example"));

    assert_eq!(answer.action, NetworkAction::Direct);
    assert!(answer.private_allowed);
}

#[test]
fn a_module_with_no_block_keeps_the_reach_it_had() {
    let (network, _pool) = network("network-reach-undeclared", Point::absent(NETWORK_POINT));

    let answer = NetworkPolicy::decide(&network, "tv.example.old", &ask("client.example"));

    assert!(answer.private_allowed);
}
