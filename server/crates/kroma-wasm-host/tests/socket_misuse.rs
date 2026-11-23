mod support;

use support::rules::{echo, udp, Rules};
use support::{probe, request, text};

#[test]
fn a_misused_udp_socket_is_told_why_and_sends_nothing() {
    let peer = echo();
    let (mut module, rules) = udp(Rules::reaching(&[peer]));

    let response = probe(&mut module, "/udp/misuse", &peer.to_string());

    assert_eq!(
        text(&response),
        "invalid-argument invalid-state invalid-argument datagram-too-large invalid-argument"
    );
    assert!(rules.carried.lock().unwrap().is_empty());
}

#[test]
fn a_fresh_stream_is_granted_its_datagrams_before_the_guest_waits_on_it() {
    let (mut module, _) = udp(Rules::default());

    let response = probe(&mut module, "/udp/fresh-permits", "500");

    assert_eq!(text(&response), "0 of 500 fresh streams granted nothing");
}

#[test]
fn streaming_a_socket_again_before_its_streams_are_dropped_stops_the_instance() {
    let (mut module, _) = udp(Rules::default());

    let answered = module.handle(&request("/udp/stream-twice", ""));

    assert!(answered.is_err());
}

#[test]
fn an_address_is_its_own_lookup_and_asks_the_rules_nothing() {
    let (mut module, rules) = udp(Rules::default());

    let response = probe(&mut module, "/net/lookup-literal", "127.0.0.1");

    assert_eq!((response.status, text(&response).as_str()), (200, "127.0.0.1"));
    assert!(rules.seen.lock().unwrap().is_empty());
}
