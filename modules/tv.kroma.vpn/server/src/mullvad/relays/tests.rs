use super::*;

fn list() -> RelayList {
    serde_json::from_value(serde_json::json!({
        "locations": {
            "se-sto": { "country": "Sweden", "city": "Stockholm", "latitude": 0, "longitude": 0 },
            "se-got": { "country": "Sweden", "city": "Gothenburg", "latitude": 0, "longitude": 0 },
            "ch-zrh": { "country": "Switzerland", "city": "Zurich", "latitude": 0, "longitude": 0 }
        },
        "wireguard": {
            "ipv4_gateway": "10.64.0.1",
            "port_ranges": [[51820, 51820]],
            "relays": [
                relay("se-sto-wg-001", "se-sto", true, 100, true),
                relay("se-sto-wg-002", "se-sto", true, 300, true),
                relay("se-got-wg-001", "se-got", true, 100, false),
                relay("ch-zrh-wg-001", "ch-zrh", false, 100, true)
            ]
        }
    }))
    .unwrap()
}

fn relay(
    hostname: &str,
    location: &str,
    active: bool,
    weight: u32,
    include_in_country: bool,
) -> serde_json::Value {
    serde_json::json!({
        "hostname": hostname, "location": location, "active": active,
        "owned": hostname.ends_with("002"),
        "provider": "31173", "ipv4_addr_in": "185.65.135.1", "ipv6_addr_in": "2a03::1",
        "public_key": "pub", "weight": weight, "include_in_country": include_in_country
    })
}

#[test]
fn only_places_with_an_active_relay_are_offered_by_name() {
    let countries = list().countries();

    assert_eq!(countries.len(), 1);
    assert_eq!(countries[0].name, "Sweden");
    let cities: Vec<&str> = countries[0]
        .cities
        .iter()
        .map(|c| c.name.as_str())
        .collect();
    assert_eq!(cities, ["Gothenburg", "Stockholm"]);
}

#[test]
fn a_country_pick_follows_the_relays_weights() {
    let list = list();

    let light = list.pick("se", None, false, 0).unwrap();
    let heavy = list.pick("se", None, false, 100).unwrap();

    assert_eq!(light.hostname, "se-sto-wg-001");
    assert_eq!(heavy.hostname, "se-sto-wg-002");
}

#[test]
fn a_relay_kept_out_of_country_picks_is_reached_by_its_city() {
    let list = list();

    let by_city = list.pick("se", Some("se-got"), false, 0).unwrap();
    let by_country: Vec<String> = (0..400)
        .map(|roll| list.pick("se", None, false, roll).unwrap().hostname.clone())
        .collect();

    assert_eq!(by_city.hostname, "se-got-wg-001");
    assert!(!by_country.contains(&"se-got-wg-001".to_string()));
}

#[test]
fn a_place_with_no_active_relay_has_nothing_to_pick() {
    assert!(list().pick("ch", None, false, 0).is_none());
    assert!(list().pick("ch", Some("ch-zrh"), false, 0).is_none());
}

#[test]
fn owned_only_keeps_to_the_servers_mullvad_owns() {
    let list = list();

    let picks: Vec<String> = (0..400)
        .map(|roll| list.pick("se", None, true, roll).unwrap().hostname.clone())
        .collect();

    assert!(picks.iter().all(|hostname| hostname == "se-sto-wg-002"));
    assert!(list.pick("se", Some("se-got"), true, 0).is_none());
}

#[test]
fn a_place_says_whether_mullvad_owns_a_server_there() {
    let countries = list().countries();

    let sweden = &countries[0];
    assert!(sweden.owned);
    let owned: Vec<(&str, bool)> = sweden
        .cities
        .iter()
        .map(|c| (c.name.as_str(), c.owned))
        .collect();
    assert_eq!(owned, [("Gothenburg", false), ("Stockholm", true)]);
}
