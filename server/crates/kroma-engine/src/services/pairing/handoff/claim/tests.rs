use super::*;
use crate::services::pairing::approved;
use crate::services::pairing::grants::PollState;
use crate::services::pairing::handoff::new;
use crate::services::pairing::handoff::test_support::{
    announce, announce_unplaceable, claim, grant, grant_checked, grant_heard, user, ELSEWHERE,
    HOUSEHOLD, OTHER_HOUSEHOLD, PHONE, TV,
};

#[test]
fn granting_hands_the_tv_the_account_it_was_waiting_for() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(matches!(h.poll(&tv.secret), PollState::Pending));
    assert!(grant(&h, &tv.handle, PHONE).is_ok());

    let (token, access_token, user) = approved(h.poll(&tv.secret)).expect("the granted session");
    assert_eq!((token.as_str(), access_token.as_str()), ("tok", "acc"));
    assert_eq!(user.id, "u1");
}

#[test]
fn a_handle_learned_elsewhere_is_useless_off_the_tvs_subnet() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(grant(&h, &tv.handle, ELSEWHERE).is_err());
    assert!(matches!(h.poll(&tv.secret), PollState::Pending));
}

#[test]
fn an_unknown_handle_is_refused() {
    let h = new();
    assert!(grant(&h, "deadbeef", PHONE).is_err());
}

#[test]
fn a_beacon_nobody_could_place_is_not_granted_without_its_check() {
    let h = new();
    let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
    assert!(matches!(
        grant(&h, &tv.handle, PHONE),
        Err(Refusal::CheckRequired)
    ));
    assert!(matches!(
        grant_checked(&h, &tv.handle, PHONE, "   "),
        Err(Refusal::CheckRequired)
    ));
    assert!(matches!(
        grant_checked(&h, &tv.handle, PHONE, "WRONG"),
        Err(Refusal::CheckWrong)
    ));
    assert!(matches!(h.poll(&tv.secret), PollState::Pending));

    assert!(grant_checked(&h, &tv.handle, PHONE, &tv.check).is_ok());
    assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
}

#[test]
fn the_check_was_read_off_a_screen_so_case_and_spacing_do_not_matter() {
    let h = new();
    let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
    let typed = format!("  {}  ", tv.check.to_lowercase());
    assert!(grant_checked(&h, &tv.handle, PHONE, &typed).is_ok());
}

#[test]
fn a_beacon_that_was_placed_ignores_a_check_sent_anyway() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(grant_checked(&h, &tv.handle, PHONE, "WRONG").is_ok());
}

#[test]
fn three_wrong_checks_take_the_beacon_down_for_good() {
    let h = new();
    let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
    let wrong = || grant_checked(&h, &tv.handle, PHONE, "WRONG");
    assert!(matches!(wrong(), Err(Refusal::CheckWrong)));
    assert!(matches!(wrong(), Err(Refusal::CheckWrong)));
    assert!(matches!(wrong(), Err(Refusal::CheckTooMany)));

    // Gone, so even the right answer buys nothing and the TV starts over.
    assert!(matches!(
        grant_checked(&h, &tv.handle, PHONE, &tv.check),
        Err(Refusal::Gone)
    ));
    assert!(matches!(h.poll(&tv.secret), PollState::Unknown));
    assert!(h.nearby(PHONE).is_empty());
}

#[test]
fn a_caller_out_of_reach_never_learns_whether_its_check_was_right() {
    // Nor may it spend the beacon's tries: the check is what a caller in the
    // room adds to the address rule, never a way around it.
    let h = new();
    let tv = announce_unplaceable(&h, "tv-tizen-01", "Tizen", TV);
    for _ in 0..5 {
        assert!(matches!(
            grant_checked(&h, &tv.handle, ELSEWHERE, &tv.check),
            Err(Refusal::Gone)
        ));
    }
    assert!(grant_checked(&h, &tv.handle, PHONE, &tv.check).is_ok());
}

#[test]
fn a_server_somewhere_else_still_pairs_a_tv_and_a_phone_in_one_room() {
    // The server is on another network entirely, so it never sees either
    // device's own address: both arrive through their household's NAT.
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", HOUSEHOLD);

    assert_eq!(h.nearby(HOUSEHOLD).len(), 1);
    assert!(grant(&h, &tv.handle, HOUSEHOLD).is_ok());
    assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
}

#[test]
fn a_phone_leaving_through_another_router_is_not_in_the_room() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", HOUSEHOLD);
    // Next door, or the same phone on cellular: a different way out.
    assert!(h.nearby(OTHER_HOUSEHOLD).is_empty());
    assert!(grant(&h, &tv.handle, OTHER_HOUSEHOLD).is_err());
}

#[test]
fn a_phone_that_heard_the_tv_may_grant_from_anywhere_the_addresses_disagree() {
    // The routed home and the dual-stack home both look like this: two
    // devices in one room whose addresses this server cannot reconcile.
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(grant(&h, &tv.handle, ELSEWHERE).is_err());

    // Quoting the proof is quoting a multicast that never left the link.
    assert!(grant_heard(&h, &tv.handle, ELSEWHERE, &tv.proof).is_ok());
    assert!(matches!(h.poll(&tv.secret), PollState::Authorized { .. }));
}

#[test]
fn a_proof_that_is_not_this_beacons_is_worth_nothing() {
    let h = new();
    let salon = announce(&h, "tv-salon-01", "Salon", TV);
    let chambre = announce(&h, "tv-chambre-01", "Chambre", TV);

    // Another beacon's proof, and an invented one, both fail.
    assert!(grant_heard(&h, &salon.handle, ELSEWHERE, &chambre.proof).is_err());
    assert!(grant_heard(&h, &salon.handle, ELSEWHERE, "00").is_err());
    assert!(matches!(h.poll(&salon.secret), PollState::Pending));
}

#[test]
fn a_second_phone_cannot_grant_a_beacon_already_taken() {
    let h = new();
    let tv = announce(&h, "tv-salon-01", "Salon", TV);
    assert!(grant(&h, &tv.handle, PHONE).is_ok());
    let second = h.grant(
        &tv.handle,
        claim(PHONE),
        user(),
        "tok2".into(),
        "acc2".into(),
    );
    assert!(second.is_err());

    let (token, ..) = approved(h.poll(&tv.secret)).expect("the first grant");
    assert_eq!(token, "tok");
}
