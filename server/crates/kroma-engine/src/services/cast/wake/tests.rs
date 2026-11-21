use super::*;

fn hint() -> CastWakeHint {
    CastWakeHint {
        mac: Some("A0-B1-C2-D3-E4-F5".into()),
        address: Some("192.168.1.20".into()),
        app_id: Some("KromaTV001.Kroma".into()),
    }
}

fn row(network: &str) -> CastReceiver {
    CastReceiver {
        id: "tv-salon-01".into(),
        name: "Salon".into(),
        platform: "Tizen".into(),
        username: "Alice".into(),
        network: network.into(),
        now_playing: None,
        controllers: Vec::new(),
        asleep: false,
    }
}

fn arrival(network: &str, hint: CastWakeHint, peer: &str) -> Arrival {
    Arrival {
        row: row(network),
        user_id: "u1".into(),
        hint,
        peer: peer.into(),
    }
}

#[test]
fn a_television_that_said_enough_is_kept_with_its_hint_normalised() {
    let arrival = arrival("WAN", hint(), "203.0.113.9");

    let device = remembered(&arrival, 1_000).unwrap();

    assert_eq!(device.mac.as_deref(), Some("a0:b1:c2:d3:e4:f5"));
    assert_eq!(device.address.as_deref(), Some("192.168.1.20"));
    assert!(!device.beside_server);
    assert_eq!(device.seen_at, 1_000);
    assert_eq!(plan(&device).len(), 1);
}

#[test]
fn a_television_that_said_nothing_is_not_kept() {
    let arrival = arrival("WAN", CastWakeHint::default(), "203.0.113.9");

    assert!(remembered(&arrival, 1_000).is_none());
}

#[test]
fn the_address_a_television_arrived_from_on_the_servers_network_beats_the_one_it_gave() {
    let arrival = arrival("LAN", hint(), "192.168.1.107");

    let device = remembered(&arrival, 1_000).unwrap();

    assert_eq!(device.address.as_deref(), Some("192.168.1.107"));
    assert!(device.beside_server);
}

#[test]
fn an_address_seen_from_elsewhere_or_a_public_one_is_not_the_televisions_own() {
    let far = arrival("WAN", hint(), "192.168.1.107");
    let public = arrival("LAN", hint(), "203.0.113.9");

    assert_eq!(
        remembered(&far, 1_000).unwrap().address.as_deref(),
        Some("192.168.1.20")
    );
    assert_eq!(
        remembered(&public, 1_000).unwrap().address.as_deref(),
        Some("192.168.1.20")
    );
}

#[test]
fn a_kept_television_is_listed_asleep_and_placed_by_how_it_arrived() {
    let device = remembered(&arrival("WAN", hint(), "203.0.113.9"), 1_000).unwrap();

    let listed = asleep_row(&device, "Alice");

    assert!(listed.asleep);
    assert_eq!(listed.network, "WAN");
    assert_eq!(listed.name, "Salon");
}

#[test]
fn a_stored_row_is_checked_again_before_it_becomes_steps() {
    let tampered = crate::db::CastDevice {
        address: Some("8.8.8.8".into()),
        ..remembered(&arrival("WAN", hint(), "203.0.113.9"), 1_000).unwrap()
    };

    let steps = plan(&tampered);

    assert_eq!(
        steps,
        vec![CastWakeStep::Magic {
            mac: "a0:b1:c2:d3:e4:f5".into()
        }]
    );
}

#[tokio::test]
async fn an_arrival_is_written_and_one_that_says_nothing_drops_the_row() {
    let state = crate::test_support::test_state();
    let user = crate::db::create_user(&state.db, "a@test.dev", "A", "h", &[])
        .unwrap()
        .id;
    let said = Arrival {
        user_id: user.clone(),
        ..arrival("WAN", hint(), "203.0.113.9")
    };
    let silent = Arrival {
        user_id: user.clone(),
        ..arrival("WAN", CastWakeHint::default(), "203.0.113.9")
    };

    keep::write(&state.db, &said, 1_000).unwrap();
    let kept = crate::db::cast_device(&state.db, "tv-salon-01", &user).unwrap();
    keep::write(&state.db, &silent, 2_000).unwrap();
    let dropped = crate::db::cast_device(&state.db, "tv-salon-01", &user).unwrap();

    assert!(kept.is_some());
    assert!(dropped.is_none());
}
