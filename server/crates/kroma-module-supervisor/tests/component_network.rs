#![cfg(unix)]

use std::sync::atomic::Ordering;

use kroma_module_host::{NetworkAction, NetworkRoute};

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, GUEST, Server, http_server};

const NOTHING: &str = r#", "storage": {}"#;

#[test]
fn a_call_a_component_makes_goes_through_its_gateway_and_is_journaled() {
    let server = Server::new("component-fetch", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);
    let (port, hits) = http_server("from the target");

    let answered = server.get(&endpoint, &format!("/fetch?http://127.0.0.1:{port}/"));

    assert_eq!(answered.text(), "200 from the target");
    assert_eq!(hits.load(Ordering::SeqCst), 1);
    let flows = server.network.flows.lock().unwrap();
    assert_eq!(flows[0].purpose, "probe");
    assert_eq!(flows[0].route, NetworkRoute::Direct);
}

#[test]
fn a_call_the_policy_refuses_reaches_nothing_and_says_why() {
    let server = Server::new("component-refused", NetworkAction::Block);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);
    let (port, hits) = http_server("from the target");

    let answered = server.get(&endpoint, &format!("/fetch?http://127.0.0.1:{port}/"));

    assert!(
        answered.text().contains("not for you"),
        "{}",
        answered.text()
    );
    assert_eq!(hits.load(Ordering::SeqCst), 0);
    assert_eq!(
        server.network.flows.lock().unwrap()[0].route,
        NetworkRoute::Blocked
    );
}

#[test]
fn a_component_that_declares_nothing_has_no_network() {
    let server = Server::new("component-undeclared", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), NOTHING);
    let (port, hits) = http_server("from the target");

    let answered = server.get(&endpoint, &format!("/fetch?http://127.0.0.1:{port}/"));

    assert!(
        answered.text().contains("no network"),
        "{}",
        answered.text()
    );
    assert_eq!(hits.load(Ordering::SeqCst), 0);
}
