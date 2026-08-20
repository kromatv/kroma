use super::test_support::{
    admitted, announce, announce_unplaceable, grant, request, try_announce, ELSEWHERE, HOUSEHOLD,
    PHONE, TV,
};
use super::*;

#[test]
fn a_phone_on_the_same_subnet_sees_the_waiting_tv() {
    let h = new();
    let announced = announce(&h, "tv-salon-01", "Salon", TV);
    let rows = h.nearby(PHONE);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].name, "Salon");
    assert_eq!(rows[0].platform, "tvOS");
    assert_eq!(rows[0].handle, announced.handle);
    // The check string is the TV's, so the two screens agree.
    assert_eq!(rows[0].check, announced.check);
}

#[test]
fn a_phone_on_another_subnet_sees_nothing() {
    let h = new();
    announce(&h, "tv-salon-01", "Salon", TV);
    assert!(h.nearby(ELSEWHERE).is_empty());
}

#[test]
fn a_relaunched_tv_replaces_its_own_row_instead_of_adding_one() {
    let h = new();
    let first = announce(&h, "tv-salon-01", "Salon", TV);
    let second = announce(&h, "tv-salon-01", "Salon", TV);
    assert_ne!(first.handle, second.handle);
    assert_eq!(h.nearby(PHONE).len(), 1);
    assert!(matches!(h.poll(&first.secret), PollState::Unknown));
}

#[test]
fn replacing_a_beacon_granted_in_the_gap_surrenders_its_tokens() {
    let h = new();
    let first = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(grant(&h, &first.handle, PHONE).is_ok());

    let (_, orphans) = h.announce(request("tv-salon-01", "Salon", TV));
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].token, "tok");
}

#[test]
fn two_tvs_are_listed_by_name_and_keep_that_order() {
    let h = new();
    announce(&h, "tv-chambre-01", "Chambre", TV);
    announce(&h, "tv-salon-01", "Salon", TV);
    let names: Vec<String> = h.nearby(PHONE).into_iter().map(|r| r.name).collect();
    assert_eq!(names, vec!["Chambre".to_string(), "Salon".to_string()]);
}

#[test]
fn polling_keeps_a_beacon_listed_and_leaving_takes_it_down() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(matches!(h.poll(&tv.secret), PollState::Pending));
    assert_eq!(h.nearby(PHONE).len(), 1);

    assert!(h.forget(&tv.secret).is_none());
    assert!(h.nearby(PHONE).is_empty());
    assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
}

#[test]
fn a_beacon_nobody_polls_lapses_out_of_the_list() {
    // A store whose entries are stale the instant they are filed: what the
    // TTL does to a TV that was unplugged, without waiting a minute for it.
    let h = Arc::new(HandoffInner {
        grants: Grants::new(0, MAX_BEACONS),
        announces: Throttle::new(MAX_ANNOUNCES_PER_MINUTE, ANNOUNCE_WINDOW_SECS),
    });
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(h.nearby(PHONE).is_empty());
    assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
}

#[test]
fn a_tv_that_names_itself_with_a_newline_cannot_forge_a_row() {
    let h = new();
    h.announce(Announce {
        platform: "  \u{7}tvOS  ".into(),
        ..request("tv-salon-01", &format!("Salon\nAdministrateur{}", "x".repeat(80)), TV)
    });
    let row = &h.nearby(PHONE)[0];
    assert!(!row.name.contains('\n'));
    assert_eq!(row.name.chars().count(), MAX_NAME);
    assert_eq!(row.platform, "tvOS");
}

#[test]
fn the_check_string_is_short_and_free_of_look_alike_characters() {
    for _ in 0..64 {
        let check = check_string();
        assert_eq!(check.len(), CHECK_LEN);
        assert!(check.bytes().all(|b| CHECK_ALPHABET.contains(&b)), "{check}");
    }
}

#[test]
fn every_letter_of_the_check_alphabet_is_as_likely_as_every_other() {
    // `check_string` folds a random byte with `%`, which is only unbiased
    // while the alphabet divides the byte range exactly.
    assert_eq!(256 % CHECK_ALPHABET.len(), 0);
    let mut sorted = CHECK_ALPHABET.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), CHECK_ALPHABET.len(), "a repeated letter is a heavier one");
}

#[test]
fn a_beacon_nobody_could_place_says_so_to_the_television_and_to_the_phone() {
    let h = new();
    let placed = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(!placed.confirm_required);

    let shell = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
    assert!(shell.confirm_required);

    let rows = h.nearby(PHONE);
    let row_of = |handle: &str| {
        rows.iter().find(|r| r.handle == handle).expect("a row").confirm_required
    };
    assert!(row_of(&shell.handle));
    assert!(!row_of(&placed.handle));
}

#[test]
fn one_address_announcing_far_past_any_cadence_is_refused() {
    let h = new();
    for attempt in 1..=MAX_ANNOUNCES_PER_MINUTE {
        assert!(!h.announcing_too_often(TV), "refused announce {attempt}");
    }
    assert!(h.announcing_too_often(TV));
    // And it costs the household next door nothing.
    assert!(!h.announcing_too_often(HOUSEHOLD));
}

#[test]
fn a_full_networks_worth_of_televisions_never_reaches_the_ceiling() {
    // Every television of a network's whole share coming back from a power
    // cut: one announce each, then a rename apiece (webOS and Tizen both
    // learn their own name a beat after the first announce).
    let h = new();
    for _ in 0..(MAX_PER_NETWORK * 2) {
        assert!(!h.announcing_too_often(TV));
    }
}

#[test]
fn handles_do_not_repeat() {
    let h = new();
    let mut seen = std::collections::HashSet::new();
    // One per network: the share is eight, and this is about the handles.
    for i in 0..16 {
        let tv = announce(&h, &format!("tv-{i:04}-xxxx"), "Salon", &format!("192.168.{i}.20"));
        assert!(seen.insert(tv.handle), "handle repeated");
    }
}

#[test]
fn every_beacon_gets_its_own_proof() {
    let h = new();
    let mut seen = std::collections::HashSet::new();
    for i in 0..16 {
        let tv = announce(&h, &format!("tv-{i:04}-xxxx"), "Salon", &format!("192.168.{i}.20"));
        assert_eq!(tv.proof.len(), PROOF_BYTES * 2, "hex of {PROOF_BYTES} bytes");
        assert!(seen.insert(tv.proof), "proof repeated");
    }
}

#[test]
fn a_device_id_learned_elsewhere_cannot_drop_that_tvs_beacon() {
    let h = new();
    let mine = announce(&h, "tv-salon-01", "Salon", TV);
    // A device id is not a secret. Announcing it from another network must
    // not take my beacon down.
    announce(&h, "tv-salon-01", "Impostor", HOUSEHOLD);

    assert_eq!(h.nearby(PHONE).len(), 1);
    assert_eq!(h.nearby(PHONE)[0].name, "Salon");
    assert!(matches!(h.poll(&mine.secret), PollState::Pending));
}

#[test]
fn a_full_network_refuses_the_next_television_rather_than_evicting_one() {
    // The share belongs to the devices that took it. Evicting would let a
    // caller loop this endpoint and keep every real television out of every
    // phone's list.
    let h = new();
    let first = announce(&h, "tv-0000-xxxx", "Salon", HOUSEHOLD);
    for i in 1..MAX_PER_NETWORK {
        announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
    }
    assert_eq!(h.nearby(HOUSEHOLD).len(), MAX_PER_NETWORK);

    assert!(admitted(try_announce(&h, "tv-late-xxxx", "Late", HOUSEHOLD)).is_none());
    // Nobody was pushed out, and the one that was there still works.
    assert_eq!(h.nearby(HOUSEHOLD).len(), MAX_PER_NETWORK);
    assert!(matches!(h.poll(&first.secret), PollState::Pending));
}

#[test]
fn a_full_network_does_not_stop_another_one() {
    let h = new();
    for i in 0..MAX_PER_NETWORK {
        announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
    }
    let mine = announce(&h, "tv-salon-01", "Salon", TV);
    assert_eq!(h.nearby(PHONE).len(), 1);
    assert!(matches!(h.poll(&mine.secret), PollState::Pending));
}

#[test]
fn a_flood_spread_over_many_networks_pays_for_the_next_honest_television() {
    // Enough networks each holding their full share to fill the store. They
    // are cheap to come by (a routed home gives every /64 one of its own),
    // which is how a flood used to shut every other network out entirely.
    let h = new();
    let mut flood = Vec::new();
    for network in 0..(MAX_BEACONS / MAX_PER_NETWORK) {
        for tv in 0..MAX_PER_NETWORK {
            let ip = format!("203.0.113.{}", network + 1);
            flood.push(announce(&h, &format!("tv-{network:02}{tv:02}-xxxx"), "Flood", &ip));
        }
    }

    let mine = announce(&h, "tv-salon-01", "Salon", TV);
    assert_eq!(h.nearby(PHONE).len(), 1);
    assert!(matches!(h.poll(&mine.secret), PollState::Pending));
    // And what it cost is the flood's oldest beacon, never a bystander's.
    assert!(matches!(h.poll(&flood[0].secret), PollState::Unknown));
    assert!(matches!(h.poll(&flood[MAX_PER_NETWORK].secret), PollState::Pending));
}

#[test]
fn a_television_re_announcing_into_a_full_network_still_gets_its_slot_back() {
    // It gives up its own beacon first, so the share it re-enters is the
    // one it already held.
    let h = new();
    announce(&h, "tv-mine-xxxx", "Salon", HOUSEHOLD);
    for i in 1..MAX_PER_NETWORK {
        announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Flood", HOUSEHOLD);
    }
    let again = announce(&h, "tv-mine-xxxx", "Salon", HOUSEHOLD);
    assert!(matches!(h.poll(&again.secret), PollState::Pending));
}

#[test]
fn a_beacon_already_granted_stops_being_listed() {
    // Its television is seconds from signing in, and a second grant is
    // refused, so offering the row again could only fail.
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert_eq!(h.nearby(PHONE).len(), 1);

    assert!(grant(&h, &tv.handle, PHONE).is_ok());
    assert!(h.nearby(PHONE).is_empty(), "a spent beacon is not on offer");
}

#[test]
fn the_share_is_per_network_and_the_bound_that_bites_is_that_one() {
    let h = new();
    for i in 0..MAX_PER_NETWORK {
        announce(&h, &format!("tv-{i:04}-xxxx", i = i), "Salon", TV);
    }
    assert_eq!(h.nearby(PHONE).len(), MAX_PER_NETWORK);
    assert!(admitted(try_announce(&h, "tv-late-xxxx", "Late", TV)).is_none());
}
