use super::*;

fn list() -> RelayList {
    serde_json::from_value(serde_json::json!({
        "locations": {
            "se-sto": { "country": "Sweden", "city": "Stockholm", "latitude": 0, "longitude": 0 }
        },
        "wireguard": {
            "ipv4_gateway": "10.64.0.1",
            "relays": [{
                "hostname": "se-sto-wg-001", "location": "se-sto", "active": true, "owned": true,
                "ipv4_addr_in": "185.65.135.1", "public_key": "relay-pub", "weight": 100
            }]
        }
    }))
    .unwrap()
}

fn account() -> Account {
    Account {
        number: "1234123412341234".into(),
        device_id: "d1".into(),
        device_name: "Brave Otter".into(),
        private_key: "private".into(),
        ipv4: "10.140.1.2/32".into(),
        place: None,
    }
}

#[test]
fn an_account_number_keeps_its_digits_however_it_was_typed() {
    assert_eq!(account_number(" 1234 1234-1234 1234 "), "1234123412341234");
}

#[test]
fn a_bare_tunnel_address_gets_a_host_prefix() {
    assert_eq!(with_prefix("10.140.1.2"), "10.140.1.2/32");
    assert_eq!(with_prefix("10.140.1.2/32"), "10.140.1.2/32");
}

#[test]
fn the_config_names_its_relay_and_place_where_the_page_reads_them() {
    let list = list();
    let relay = list.pick("se", None, false, 0).unwrap();
    let place = place_of(&list, relay, Some("se-sto"));

    let config = render(&account(), relay, &list.wireguard.ipv4_gateway, &place);

    assert!(
        config.contains("\n# Mullvad se-sto-wg-001 · Sweden · Stockholm\n"),
        "{config}"
    );
}

#[test]
fn the_config_carries_the_devices_key_and_address_and_the_relays_peer() {
    let list = list();
    let relay = list.pick("se", None, false, 0).unwrap();
    let place = place_of(&list, relay, None);

    let config = render(&account(), relay, &list.wireguard.ipv4_gateway, &place);

    assert!(config.contains("PrivateKey = private\n"), "{config}");
    assert!(config.contains("Address = 10.140.1.2/32\n"), "{config}");
    assert!(config.contains("DNS = 10.64.0.1\n"), "{config}");
    assert!(config.contains("PublicKey = relay-pub\n"), "{config}");
    assert!(
        config.contains("Endpoint = 185.65.135.1:51820\n"),
        "{config}"
    );
    assert!(config.contains("AllowedIPs = 0.0.0.0/0\n"), "{config}");
}

#[test]
fn a_country_pick_names_the_country_and_leaves_the_city_open() {
    let list = list();
    let relay = list.pick("se", None, false, 0).unwrap();

    let place = place_of(&list, relay, None);

    assert_eq!(place.country, "se");
    assert_eq!(place.country_name, "Sweden");
    assert_eq!((place.city, place.city_name), (None, None));
    assert_eq!(place.hostname, "se-sto-wg-001");
}

#[test]
fn connecting_with_no_account_and_nothing_held_asks_for_one() {
    let dir = kroma_module_sdk::testing::temp_dir("mullvad-none");

    let refused = connect(dir.path(), None, "se", None, false).unwrap_err();

    assert_eq!(refused, ConnectError::AccountNeeded);
}

#[test]
fn what_this_server_holds_survives_a_restart_and_is_private() {
    let dir = kroma_module_sdk::testing::temp_dir("mullvad-store");

    store::save(dir.path(), &account()).unwrap();

    assert_eq!(held(dir.path()), Some(account()));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.path().join("mullvad.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}

#[test]
fn a_config_on_this_servers_device_key_is_this_servers_mullvad() {
    let dir = kroma_module_sdk::testing::temp_dir("mullvad-uses-key");
    store::save(dir.path(), &account()).unwrap();
    let mine = "[Interface]\nPrivateKey = private\n[Peer]\nPublicKey = relay\n";
    let foreign = "[Interface]\nPrivateKey = someone-else\n[Peer]\nPublicKey = relay\n";

    assert!(uses_key(dir.path(), mine));
    assert!(!uses_key(dir.path(), foreign));
}

#[test]
fn the_relays_this_device_already_uses_are_the_defaults_and_the_kept_places() {
    let dir = kroma_module_sdk::testing::temp_dir("mullvad-in-use");
    store::save(dir.path(), &account()).unwrap();
    let on_key = |host: &str| {
        format!("[Interface]\nPrivateKey = private\n[Peer]\n# Mullvad {host} · Switzerland\nPublicKey = {host}\n")
    };
    let foreign = "[Interface]\nPrivateKey = other\n[Peer]\n# Mullvad se-got-wg-001 · Sweden\nPublicKey = x\n";
    crate::saved::add(dir.path(), &[on_key("ch-zrh-wg-002"), foreign.to_string()]).unwrap();

    let in_use = relays_in_use(dir.path(), &account(), &on_key("ch-zrh-wg-001"));

    assert_eq!(in_use, ["ch-zrh-wg-001", "ch-zrh-wg-002"]);
}
