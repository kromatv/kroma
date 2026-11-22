use super::raw_sockets::{raw, rule, tcp_to, udp_to};
use super::*;

fn named<'a>(names: &'a [String], socket: RawSocket<'a>) -> RawSocket<'a> {
    RawSocket { names, ..socket }
}

fn on(network: Network, networks: Vec<LocalNetwork>) -> Network {
    network.with_local_networks(Arc::new(move || networks.clone()))
}

fn subnet(address: &str, prefix: u8) -> LocalNetwork {
    LocalNetwork {
        address: address.parse().unwrap(),
        prefix,
    }
}

fn api_tcp(tag: &str) -> (Network, TempPool) {
    raw(tag, json!([{ "purpose": "api", "to": ["api.mymodule.dev"], "proto": ["tcp"] }]))
}

#[test]
fn a_host_entry_reaches_only_the_public_addresses_its_name_resolved_to() {
    let (network, _pool) = api_tcp("reach-host-public");
    let names = ["api.mymodule.dev".to_string()];

    let private: Vec<_> = ["10.0.0.5:6379", "192.168.1.20:22", "[fd00:ec2::254]:80"]
        .into_iter()
        .map(|address| rule(&network, &named(&names, tcp_to(address))))
        .collect();
    let public = rule(&network, &named(&names, tcp_to("1.1.1.1:443")));

    assert!(private.iter().all(Result::is_err), "{private:?}");
    assert_eq!(public, Ok("api".to_string()));
}

#[test]
fn a_host_entry_reaches_loopback_only_when_it_names_loopback() {
    let (by_name, _a) = api_tcp("reach-loopback-name");
    let (by_literal, _b) = raw(
        "reach-loopback-literal",
        json!([{ "purpose": "engine", "to": ["127.0.0.1"], "proto": ["tcp"] }]),
    );
    let names = ["api.mymodule.dev".to_string()];

    let named_loopback = rule(&by_name, &named(&names, tcp_to("127.0.0.1:6379")));
    let literal_loopback = rule(&by_literal, &tcp_to("127.0.0.1:6379"));

    assert!(named_loopback.is_err());
    assert_eq!(literal_loopback, Ok("engine".to_string()));
}

#[test]
fn a_local_name_or_a_setting_keeps_its_private_reach() {
    let (network, _pool) = raw(
        "reach-local-name",
        json!([
            { "purpose": "nas", "to": ["nas.local"], "proto": ["tcp"] },
            { "purpose": "plex", "to": ["setting:plexUrl"], "proto": ["tcp"] }
        ]),
    );
    network
        .settings
        .set_internal(&network.db, "plexUrl", json!("http://plex.example.com:32400"))
        .unwrap();
    let nas = ["nas.local".to_string()];
    let plex = ["plex.example.com".to_string()];

    let local = rule(&network, &named(&nas, tcp_to("10.0.0.5:445")));
    let set = rule(&network, &named(&plex, tcp_to("192.168.1.20:32400")));

    assert_eq!(local, Ok("nas".to_string()));
    assert_eq!(set, Ok("plex".to_string()));
}

#[test]
fn the_cloud_metadata_addresses_are_never_reachable() {
    let (network, _pool) = raw(
        "reach-metadata",
        json!([
            { "purpose": "meta", "to": ["100.100.100.200"], "proto": ["tcp"] },
            { "purpose": "nas", "to": ["nas.local"], "proto": ["tcp"] }
        ]),
    );
    let nas = ["nas.local".to_string()];

    let alibaba = rule(&network, &tcp_to("100.100.100.200:80"));
    let aws = rule(&network, &named(&nas, tcp_to("[fd00:ec2::254]:80")));

    assert_eq!(alibaba, Err(Some(GUARD_METADATA.to_string())));
    assert_eq!(aws, Err(Some(GUARD_METADATA.to_string())));
}

#[test]
fn public_never_covers_the_broadcast_of_a_public_network_this_machine_sits_on() {
    let (network, _pool) = raw(
        "reach-public-broadcast",
        json!([{ "purpose": "peers", "to": ["public"], "proto": ["udp"] }]),
    );
    let network = on(network, vec![subnet("45.67.89.10", 24)]);

    let broadcast = rule(&network, &udp_to("45.67.89.255:6881"));
    let peer = rule(&network, &udp_to("45.67.89.20:6881"));

    assert!(broadcast.is_err());
    assert_eq!(peer, Ok("peers".to_string()));
}

#[test]
fn every_entry_that_covers_a_socket_must_send_it_direct() {
    let (network, _pool) = raw(
        "reach-every-entry",
        json!([
            { "purpose": "updates", "to": ["public"], "proto": ["udp"] },
            { "purpose": "peers", "to": ["public"], "proto": ["udp"] }
        ]),
    );
    let rules: NetworkRules = serde_json::from_value(json!({
        "defaultAction": "allow",
        "rules": [{ "id": "peers-vpn", "purpose": "peers", "action": "vpn" }]
    }))
    .unwrap();
    network.set_rules(rules).unwrap();

    let ruled = rule(&network, &udp_to("8.8.8.8:6881"));

    assert_eq!(ruled, Err(Some("peers-vpn".to_string())));
}

#[test]
fn the_servers_own_ports_are_refused_on_a_broadcast_or_a_multicast_address() {
    let (network, _pool) = raw(
        "reach-own-broadcast",
        json!([{ "purpose": "discovery", "to": ["lan"], "proto": ["udp"] }]),
    );

    let refused: Vec<_> = ["192.168.1.255:4040", "255.255.255.255:4040", "[ff02::1]:4040"]
        .into_iter()
        .map(|address| rule(&network, &udp_to(address)))
        .collect();

    assert!(
        refused.iter().all(|ruled| *ruled == Err(Some(GUARD_LOOPBACK.to_string()))),
        "{refused:?}"
    );
}

#[test]
fn lan_never_covers_loopback_or_this_host_even_beside_an_interface_with_no_netmask() {
    let (network, _pool) = raw(
        "reach-no-netmask",
        json!([{ "purpose": "discovery", "to": ["lan"], "proto": ["udp"] }]),
    );
    let network = on(network, vec![subnet("192.168.1.10", 0)]);

    let refused: Vec<_> = ["127.0.0.1:7359", "[::1]:7359", "0.0.0.5:7359", "10.0.0.5:7359"]
        .into_iter()
        .map(|address| rule(&network, &udp_to(address)))
        .collect();

    assert!(refused.iter().all(Result::is_err), "{refused:?}");
}

#[test]
fn a_rule_that_sends_the_purpose_through_a_running_network_refuses_the_socket() {
    let (network, _pool) = network(
        "reach-vpn-up",
        offering(vec![offer("vpn", "127.0.0.1:25345", true)]),
    );
    let permissions: kroma_module_manifest::Permissions = serde_json::from_value(json!({
        "net": { "connect": [{ "purpose": "peers", "to": ["public"], "proto": ["udp"] }] }
    }))
    .unwrap();
    let network = on(network.with_declared(Arc::new(move |_| Some(permissions.clone()))), Vec::new());
    network.set_rules(everything("vpn")).unwrap();

    let ruled = rule(&network, &udp_to("8.8.8.8:6881"));

    assert_eq!(ruled, Err(Some("all".to_string())));
}

#[test]
fn a_name_a_setting_names_may_be_looked_up_for_its_entry() {
    let (network, _pool) = raw(
        "reach-lookup-setting",
        json!([{ "purpose": "tracker", "to": ["setting:trackerUrl"], "proto": ["udp"] }]),
    );
    network
        .settings
        .set_internal(&network.db, "trackerUrl", json!("http://tracker.example.org:6969/announce"))
        .unwrap();

    let looked_up = network.rule_lookup("tv.kroma.torrents", "tracker.example.org");

    assert_eq!(looked_up, Ok("tracker".to_string()));
}

#[test]
fn a_name_resolved_twice_to_one_address_is_ruled_as_one() {
    let (network, _pool) = api_tcp("reach-name-twice");
    let names = ["api.mymodule.dev".to_string(), "API.mymodule.dev".to_string()];

    let ruled = rule(&network, &named(&names, tcp_to("1.1.1.1:443")));

    assert_eq!(ruled, Ok("api".to_string()));
}
