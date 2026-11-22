use std::net::SocketAddr;

use kroma_module_manifest::Proto;

use super::*;

pub(super) const DISCOVERY: &str = "tv.kroma.import.jellyfin";

fn home() -> LocalNetworks {
    Arc::new(|| {
        vec![LocalNetwork {
            address: "192.168.1.10".parse().unwrap(),
            prefix: 24,
        }]
    })
}

pub(super) fn raw(tag: &str, connect: serde_json::Value) -> (Network, TempPool) {
    let (network, pool) = network(tag, Point::absent(NETWORK_POINT));
    let permissions: kroma_module_manifest::Permissions =
        serde_json::from_value(json!({ "net": { "connect": connect } })).unwrap();
    let network = network
        .with_declared(Arc::new(move |_| Some(permissions.clone())))
        .with_local_networks(home())
        .with_core_ports(4040, None);
    (network, pool)
}

fn lan_udp(tag: &str) -> (Network, TempPool) {
    raw(
        tag,
        json!([{ "purpose": "discovery", "to": ["lan"], "ports": [7359], "proto": ["udp"] }]),
    )
}

pub(super) fn udp_to(address: &str) -> RawSocket<'static> {
    RawSocket {
        proto: Proto::Udp,
        address: address.parse::<SocketAddr>().unwrap(),
        names: &[],
    }
}

pub(super) fn tcp_to(address: &str) -> RawSocket<'static> {
    RawSocket {
        proto: Proto::Tcp,
        ..udp_to(address)
    }
}

pub(super) fn rule(network: &Network, socket: &RawSocket<'_>) -> Result<String, Option<String>> {
    network
        .rule_socket(DISCOVERY, socket)
        .map_err(|refusal| refusal.rule)
}

#[test]
fn a_declared_datagram_is_ruled_for_the_purpose_of_its_entry() {
    let (network, _pool) = lan_udp("raw-declared");

    let ruled = rule(&network, &udp_to("192.168.1.20:7359"));

    assert_eq!(ruled, Ok("discovery".to_string()));
}

#[test]
fn a_protocol_the_entry_does_not_name_is_not_declared() {
    let (network, _pool) = lan_udp("raw-other-proto");

    let ruled = rule(&network, &tcp_to("192.168.1.20:7359"));

    assert_eq!(ruled, Err(Some(PERMISSION_NET_CONNECT.to_string())));
}

#[test]
fn an_entry_that_names_no_protocol_grants_no_raw_socket() {
    let (network, _pool) = raw("raw-no-proto", json!([{ "purpose": "api", "to": ["lan"] }]));

    let ruled = rule(&network, &tcp_to("192.168.1.20:8096"));

    assert_eq!(ruled, Err(Some(PERMISSION_NET_CONNECT.to_string())));
}

#[test]
fn a_port_the_entry_does_not_name_is_not_declared() {
    let (network, _pool) = lan_udp("raw-other-port");

    let ruled = rule(&network, &udp_to("192.168.1.20:7360"));

    assert_eq!(ruled, Err(Some(PERMISSION_NET_CONNECT.to_string())));
}

#[test]
fn lan_reaches_the_subnet_its_broadcasts_and_the_multicast_that_stays_on_the_link() {
    let (network, _pool) = raw(
        "raw-lan-reach",
        json!([{ "purpose": "discovery", "to": ["lan"], "proto": ["udp"] }]),
    );

    let reached: Vec<_> = [
        "192.168.1.20:7359",
        "192.168.1.255:7359",
        "255.255.255.255:7359",
        "239.0.0.250:32414",
        "224.0.0.251:5353",
        "[ff02::1]:7359",
    ]
    .into_iter()
    .map(|address| rule(&network, &udp_to(address)))
    .collect();

    assert!(reached.iter().all(Result::is_ok), "{reached:?}");
}

#[test]
fn lan_refuses_a_public_address_and_a_private_one_off_this_machines_networks() {
    let (network, _pool) = lan_udp("raw-lan-refuse");

    let refused: Vec<_> = [
        "8.8.8.8:7359",
        "10.0.0.5:7359",
        "127.0.0.1:7359",
        "224.0.1.1:7359",
    ]
    .into_iter()
    .map(|address| rule(&network, &udp_to(address)))
    .collect();

    assert!(refused.iter().all(Result::is_err), "{refused:?}");
}

#[test]
fn public_reaches_a_public_address_and_never_the_lan_or_a_broadcast() {
    let (network, _pool) = raw(
        "raw-public",
        json!([{ "purpose": "peers", "to": ["public"], "proto": ["udp"] }]),
    );

    let public = rule(&network, &udp_to("8.8.8.8:6881"));
    let local: Vec<_> = [
        "192.168.1.20:6881",
        "192.168.1.255:6881",
        "255.255.255.255:6881",
        "239.0.0.250:6881",
    ]
    .into_iter()
    .map(|address| rule(&network, &udp_to(address)))
    .collect();

    assert_eq!(public, Ok("peers".to_string()));
    assert!(local.iter().all(Result::is_err), "{local:?}");
}

#[test]
fn a_host_entry_covers_an_address_only_through_the_name_resolved_to_it() {
    let (network, _pool) = raw(
        "raw-host",
        json!([{ "purpose": "tracker", "to": ["tracker.example.org"], "proto": ["tcp"] }]),
    );
    let names = ["tracker.example.org".to_string()];
    let resolved = RawSocket {
        names: &names,
        ..tcp_to("1.1.1.1:443")
    };

    let unnamed = rule(&network, &tcp_to("1.1.1.1:443"));
    let named = rule(&network, &resolved);

    assert_eq!(unnamed, Err(Some(PERMISSION_NET_CONNECT.to_string())));
    assert_eq!(named, Ok("tracker".to_string()));
}

#[test]
fn the_servers_own_ports_on_its_own_address_are_refused() {
    let (network, _pool) = raw(
        "raw-own-port",
        json!([{ "purpose": "discovery", "to": ["lan"], "proto": ["tcp"] }]),
    );

    let ruled = rule(&network, &tcp_to("192.168.1.10:4040"));

    assert_eq!(ruled, Err(Some(GUARD_LOOPBACK.to_string())));
}

#[test]
fn a_rule_that_blocks_the_purpose_refuses_the_socket() {
    let (network, _pool) = lan_udp("raw-rule-block");
    network.set_rules(everything("block")).unwrap();

    let ruled = rule(&network, &udp_to("192.168.1.20:7359"));

    assert_eq!(ruled, Err(Some("all".to_string())));
}

#[test]
fn a_rule_that_sends_the_purpose_through_a_network_refuses_the_socket() {
    let (network, _pool) = raw(
        "raw-rule-vpn",
        json!([{ "purpose": "peers", "to": ["public"], "proto": ["udp"] }]),
    );
    network.set_rules(everything("vpn")).unwrap();

    let ruled = rule(&network, &udp_to("8.8.8.8:6881"));

    assert_eq!(ruled, Err(Some("all".to_string())));
}

#[test]
fn a_module_that_declares_no_permissions_has_no_raw_socket() {
    let (network, _pool) = network("raw-undeclared", Point::absent(NETWORK_POINT));

    let ruled = network.rule_socket(DISCOVERY, &udp_to("192.168.1.20:7359"));

    assert!(ruled.is_err());
}

#[test]
fn a_name_a_raw_entry_names_may_be_looked_up_for_that_entry() {
    let (network, _pool) = raw(
        "raw-lookup-host",
        json!([{ "purpose": "tracker", "to": ["*.example.org"], "proto": ["udp"] }]),
    );

    let looked_up = network.rule_lookup(DISCOVERY, "tracker.example.org");

    assert_eq!(looked_up, Ok("tracker".to_string()));
}

#[test]
fn a_name_no_raw_entry_names_is_not_looked_up() {
    let (network, _pool) = raw(
        "raw-lookup-other",
        json!([
            { "purpose": "tracker", "to": ["*.example.org"], "proto": ["udp"] },
            { "purpose": "api", "to": ["data.example.net"] }
        ]),
    );

    let looked_up = network.rule_lookup(DISCOVERY, "data.example.net");

    assert!(looked_up.is_err());
}

#[test]
fn lan_grants_no_lookup_and_public_only_a_public_name() {
    let (network, _pool) = raw(
        "raw-lookup-classes",
        json!([
            { "purpose": "discovery", "to": ["lan"], "proto": ["udp"] },
            { "purpose": "peers", "to": ["public"], "proto": ["tcp"] }
        ]),
    );

    let local = network.rule_lookup(DISCOVERY, "nas.local");
    let public = network.rule_lookup(DISCOVERY, "peer.example.com");

    assert!(local.is_err());
    assert_eq!(public, Ok("peers".to_string()));
}

#[test]
fn a_rule_that_blocks_the_purpose_refuses_the_lookup() {
    let (network, _pool) = raw(
        "raw-lookup-rule",
        json!([{ "purpose": "peers", "to": ["public"], "proto": ["tcp"] }]),
    );
    network.set_rules(everything("block")).unwrap();

    let looked_up = network.rule_lookup(DISCOVERY, "peer.example.com");

    assert_eq!(looked_up.map_err(|refusal| refusal.rule), Err(Some("all".to_string())));
}

#[test]
fn a_host_entry_never_covers_a_broadcast_or_a_multicast_address() {
    let (network, _pool) = raw(
        "raw-host-broadcast",
        json!([{
            "purpose": "spread",
            "to": ["255.255.255.255", "239.0.0.250", "192.168.1.255"],
            "proto": ["udp"]
        }]),
    );

    let refused: Vec<_> = ["255.255.255.255:9", "239.0.0.250:9", "192.168.1.255:9"]
        .into_iter()
        .map(|address| rule(&network, &udp_to(address)))
        .collect();

    assert!(refused.iter().all(Result::is_err), "{refused:?}");
}
