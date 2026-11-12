use kroma_module_host::NetworkSeal;

use super::*;

#[test]
fn a_network_name_two_providers_offer_goes_to_the_first() {
    let networks = offering(vec![
        offer("vpn", "127.0.0.1:1000", true),
        offer("vpn", "127.0.0.1:2000", true),
    ]);
    let (network, _pool) = network("network-clash", networks);

    assert_eq!(network.networks().len(), 1);
    assert_eq!(network.networks()[0].endpoint.address, "127.0.0.1:1000");
}

#[test]
fn with_nothing_offered_there_is_nothing_to_stay_behind() {
    let (network, _pool) = network("network-seal-none", offering(Vec::new()));

    assert_eq!(network.seal(), NetworkSeal::None);
}

#[test]
fn a_network_that_is_up_holds_the_seal() {
    let networks = offering(vec![offer("vpn", "127.0.0.1:1000", true)]);
    let (network, _pool) = network("network-seal-up", networks);

    assert_eq!(network.seal(), NetworkSeal::Up);
}

#[test]
fn a_network_that_is_down_breaks_the_seal() {
    let networks = offering(vec![offer("vpn", "127.0.0.1:1000", false)]);
    let (network, _pool) = network("network-seal-down", networks);

    assert_eq!(network.seal(), NetworkSeal::Down);
}

#[test]
fn an_enabled_provider_that_says_nothing_breaks_the_seal() {
    let (network, _pool) = network("network-seal-silent", Point::absent(NETWORK_POINT));
    let network = network.with_providers(Arc::new(|| vec!["tv.kroma.vpn".to_string()]));

    assert_eq!(network.seal(), NetworkSeal::Down);
}
