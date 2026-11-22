use super::*;

fn home() -> Vec<LocalNetwork> {
    vec![LocalNetwork {
        address: "192.168.1.10".parse().unwrap(),
        prefix: 24,
    }]
}

fn ip(text: &str) -> IpAddr {
    text.parse().unwrap()
}

#[test]
fn an_address_is_public_on_the_lan_or_elsewhere() {
    let places: Vec<Place> = ["8.8.8.8", "192.168.1.20", "239.0.0.250", "10.0.0.5", "127.0.0.1"]
        .into_iter()
        .map(|address| place_of(ip(address), &home()))
        .collect();

    assert_eq!(
        places,
        [Place::Public, Place::Lan, Place::Lan, Place::Elsewhere, Place::Elsewhere]
    );
}

#[test]
fn an_interface_with_no_netmask_covers_nothing() {
    let unmasked = [LocalNetwork {
        address: ip("192.168.1.10"),
        prefix: 0,
    }];

    let places: Vec<Place> = ["10.0.0.5", "::1", "0.0.0.5"]
        .into_iter()
        .map(|address| place_of(ip(address), &unmasked))
        .collect();

    assert_eq!(places, [Place::Elsewhere; 3]);
}

#[test]
fn a_broadcast_or_a_group_reaches_this_machine_and_a_neighbour_does_not() {
    let reached: Vec<bool> = ["192.168.1.255", "255.255.255.255", "ff02::1", "192.168.1.10", "192.168.1.20"]
        .into_iter()
        .map(|address| reaches_this_machine(ip(address), &home()))
        .collect();

    assert_eq!(reached, [true, true, true, true, false]);
}

#[test]
fn the_metadata_addresses_off_the_link_are_known() {
    let known: Vec<bool> = ["100.100.100.200", "fd00:ec2::254", "169.254.169.254"]
        .into_iter()
        .map(|address| is_cloud_metadata(ip(address)))
        .collect();

    assert_eq!(known, [true, true, false]);
}

#[test]
fn this_machines_networks_leave_loopback_and_unmasked_interfaces_out() {
    let networks = interface_networks();

    assert!(
        networks
            .iter()
            .all(|network| !network.address.is_loopback() && network.prefix > 0),
        "{networks:?}"
    );
}

#[test]
fn an_ipv6_address_on_a_network_this_machine_sits_on_is_lan_and_spreads_nowhere() {
    let networks = [LocalNetwork {
        address: ip("fd12::10"),
        prefix: 64,
    }];

    let neighbour = (place_of(ip("fd12::20"), &networks), spreads(ip("fd12::20"), &networks));
    let group = place_of(ip("ff02::fb"), &[]);

    assert_eq!(neighbour, (Place::Lan, false));
    assert_eq!(group, Place::Lan);
}

#[test]
fn an_address_of_the_other_family_is_on_none_of_this_machines_networks() {
    let place = place_of(ip("fd00::5"), &home());

    assert_eq!(place, Place::Elsewhere);
}
