use kroma_module_manifest::Proto;

use super::*;
use crate::api::test_support::test_app;

#[tokio::test]
async fn a_module_the_server_holds_no_declaration_for_is_refused_a_socket_and_a_lookup() {
    let t = test_app();
    let sockets = NetworkSockets(t.state.network.clone());
    let ask = SocketAsk {
        proto: Proto::Udp,
        address: "192.168.1.255:7359".parse().unwrap(),
        names: &[],
    };

    let socket = sockets.decide_socket("tv.example.unknown", &ask);
    let lookup = sockets.decide_lookup("tv.example.unknown", "tracker.example.org");

    let rules = [socket.map_err(|refused| refused.rule), lookup.map_err(|refused| refused.rule)];
    assert_eq!(
        rules,
        [
            Err(Some("permission:net.connect".to_string())),
            Err(Some("permission:net.connect".to_string()))
        ]
    );
}

#[tokio::test]
async fn a_module_gateway_guards_the_ports_the_network_policy_names_as_this_servers_own() {
    let t = test_app();

    let ports = own_ports_of(t.state.network.clone())();

    assert_eq!(ports, t.state.network.own_ports());
    assert!(ports.contains(&4443), "{ports:?}");
}
