mod support;

use kroma_wasm_host::SocketUse;
use support::rules::{echo, listening, tcp, udp, Rules, BROADCAST};
use support::{probe, sandboxed, text};

#[test]
fn a_component_with_no_socket_grant_cannot_send_a_datagram() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/udp/send", "127.0.0.1:9");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_granted_udp_exchanges_datagrams_with_an_address_its_rules_allow() {
    let peer = echo();
    let (mut module, _) = udp(Rules::reaching(&[peer]));

    let response = probe(&mut module, "/udp/exchange", &peer.to_string());

    assert_eq!(
        (response.status, text(&response)),
        (200, format!("pong from {peer}"))
    );
}

#[test]
fn a_connected_socket_waits_for_the_answer_of_its_peer() {
    let peer = echo();
    let (mut module, _) = udp(Rules::reaching(&[peer]));

    let response = probe(&mut module, "/udp/connected", &peer.to_string());

    assert_eq!(
        (response.status, text(&response)),
        (200, format!("pong from {peer} at hop limit 4 on port 1"))
    );
}

#[test]
fn a_udp_socket_takes_its_options_and_binds_an_ephemeral_port_when_it_streams() {
    let (mut module, _) = udp(Rules::default());

    let response = probe(&mut module, "/udp/options", "");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (
            200,
            "invalid-argument invalid-argument invalid-argument hops 8 buffers true \
             IpAddressFamily::Ipv6 invalid-state bound true invalid-state not-in-progress"
        )
    );
}

#[test]
fn a_socket_never_connects_to_an_address_the_rules_refuse() {
    let peer = echo();
    let (mut module, _) = udp(Rules::default());

    let response = probe(&mut module, "/udp/connected", &peer.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_datagram_to_an_address_the_rules_refuse_is_denied() {
    let peer = echo();
    let (mut module, rules) = udp(Rules::default());

    let response = probe(&mut module, "/udp/send", &peer.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
    assert!(rules
        .seen
        .lock()
        .unwrap()
        .contains(&(SocketUse::Send, peer, Vec::new())));
}

#[test]
fn a_datagram_from_an_address_the_rules_refuse_never_reaches_the_component() {
    let peer = echo();
    let rules = Rules {
        reachable: vec![peer],
        ..Rules::default()
    };
    let (mut module, _) = udp(rules);

    let response = probe(&mut module, "/udp/exchange", &peer.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "nothing came back")
    );
}

#[test]
fn a_broadcast_the_rules_allow_is_not_refused_by_the_host() {
    let (mut module, rules) = udp(Rules::reaching(&[BROADCAST.parse().unwrap()]));

    let response = probe(&mut module, "/udp/send", BROADCAST);

    let answered = (response.status, text(&response));
    let left_the_host = answered == (200, "sent 4 bytes".to_string())
        || (answered.0 == 403 && answered.1 != "PermissionDenied");
    assert!(left_the_host, "{answered:?}");
    assert!(rules.saw(SocketUse::Send, BROADCAST));
}

#[test]
fn a_broadcast_the_rules_refuse_is_denied() {
    let (mut module, rules) = udp(Rules::default());

    let response = probe(&mut module, "/udp/send", BROADCAST);

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
    assert!(rules.saw(SocketUse::Send, BROADCAST));
}

#[test]
fn a_component_never_binds_a_port_it_chose() {
    let (mut module, _) = udp(Rules::reaching(&["0.0.0.0:40123".parse().unwrap()]));

    let response = probe(&mut module, "/udp/bind", "0.0.0.0:40123");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_granted_udp_alone_cannot_open_a_tcp_connection() {
    let (_listener, address) = listening();
    let (mut module, _) = udp(Rules::reaching(&[address]));

    let response = probe(&mut module, "/net/connect", &address.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_granted_tcp_alone_cannot_send_a_datagram() {
    let peer = echo();
    let (mut module, _) = tcp(Rules::reaching(&[peer]));

    let response = probe(&mut module, "/udp/send", &peer.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_granted_tcp_connects_to_an_address_its_rules_allow() {
    let (_listener, address) = listening();
    let (mut module, _) = tcp(Rules::reaching(&[address]));

    let response = probe(&mut module, "/net/connect", &address.to_string());

    assert_eq!(response.status, 200, "{}", text(&response));
}

#[test]
fn a_tcp_connection_the_rules_refuse_is_denied() {
    let (_listener, address) = listening();
    let (mut module, _) = tcp(Rules::default());

    let response = probe(&mut module, "/net/connect", &address.to_string());

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_granted_tcp_never_listens() {
    let (mut module, _) = tcp(Rules::default());

    let response = probe(&mut module, "/tcp/listen", "0.0.0.0:0");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_name_the_rules_do_not_name_is_not_looked_up() {
    let (mut module, _) = tcp(Rules::default());

    let response = probe(&mut module, "/net/resolve", "localhost:80");

    assert_eq!(response.status, 403, "{}", text(&response));
}

#[test]
fn a_connection_to_a_name_carries_that_name_to_the_rules() {
    let (_listener, address) = listening();
    let rules = Rules {
        names: vec!["localhost".to_string()],
        ..Rules::reaching(&[address])
    };
    let (mut module, rules) = tcp(rules);

    let response = probe(
        &mut module,
        "/net/connect",
        &format!("localhost:{}", address.port()),
    );

    assert_eq!(response.status, 200, "{}", text(&response));
    assert!(rules.seen.lock().unwrap().contains(&(
        SocketUse::Connect,
        address,
        vec!["localhost".to_string()]
    )));
}
