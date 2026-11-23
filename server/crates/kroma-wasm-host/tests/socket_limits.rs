mod support;

use std::time::Instant;

use kroma_wasm_host::SocketUse;
use support::rules::{echo, listening, tcp, udp, Rules};
use support::{probe, text};

#[test]
fn a_component_holds_at_most_64_udp_sockets_at_once() {
    let (mut module, _) = udp(Rules::default());

    let response = probe(&mut module, "/udp/many", "100");

    assert!(text(&response).starts_with("opened 64 then "), "{}", text(&response));
}

#[test]
fn a_component_holds_at_most_64_tcp_connections_at_once() {
    let (_listener, address) = listening();
    let (mut module, _) = tcp(Rules::reaching(&[address]));

    let response = probe(&mut module, "/tcp/many", &address.to_string());

    assert!(text(&response).starts_with("opened 64 then "), "{}", text(&response));
}

#[test]
fn a_closed_socket_gives_its_place_back() {
    let (mut module, _) = udp(Rules::default());

    let response = probe(&mut module, "/udp/churn", "200");

    assert_eq!(text(&response), "opened 200");
}

#[test]
fn a_component_sends_no_faster_than_its_budget() {
    let peer = echo();
    let (mut module, _) = udp(Rules::reaching(&[peer]));

    let response = probe(&mut module, "/udp/flood", &peer.to_string());

    let sent: usize = text(&response).parse().unwrap_or_default();
    assert!((900..1500).contains(&sent), "{}", text(&response));
}

#[test]
fn the_bytes_each_datagram_carries_reach_the_rules() {
    let peer = echo();
    let (mut module, rules) = udp(Rules::reaching(&[peer]));

    probe(&mut module, "/udp/exchange", &peer.to_string());

    let carried = rules.carried.lock().unwrap();
    assert!(carried.contains(&(SocketUse::Send, 4)), "{carried:?}");
    assert!(carried.contains(&(SocketUse::Receive, 4)), "{carried:?}");
}

#[test]
fn an_address_carries_only_the_last_eight_names_resolved_to_it() {
    let peer = echo();
    let rules = Rules {
        any_name: true,
        ..Rules::reaching(&[peer])
    };
    let (mut module, rules) = udp(rules);

    probe(&mut module, "/net/resolve-many", &format!("20 {peer}"));

    let seen = rules.seen.lock().unwrap();
    let names = &seen.iter().find(|(using, ..)| *using == SocketUse::Send).unwrap().2;
    let latest: Vec<String> = (12..20).map(|n| format!("n{n}.example.test")).collect();
    assert_eq!(*names, latest);
}

#[test]
fn a_batch_past_the_budget_is_sent_in_part_and_the_rest_waits() {
    let peer = echo();
    let (mut module, _) = udp(Rules::reaching(&[peer]));

    let started = Instant::now();
    let response = probe(&mut module, "/udp/wasi-flood", &peer.to_string());
    let refilled = usize::try_from(started.elapsed().as_millis()).unwrap() + 1;

    let sent: usize = text(&response).parse().unwrap_or_default();
    assert!((1000..=1000 + refilled).contains(&sent), "{} in {refilled} ms", text(&response));
}
