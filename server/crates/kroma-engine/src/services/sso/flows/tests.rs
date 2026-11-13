use super::*;
use crate::services::sso::admit::{Identity, Refusal, Waiting};
use crate::services::sso::person::Person;

const NOW: i64 = 1_800_000_000;

fn new_flow() -> NewFlow {
    NewFlow {
        provider_id: "p0".into(),
        fingerprint: "fp".into(),
        intent: Intent::SignIn { invite: None },
        origin: "https://kroma.test".into(),
        redirect_uri: "https://kroma.test/api/auth/sso/callback".into(),
    }
}

fn started(flows: &Flows) -> Started {
    flows.start(new_flow(), "10.0.0.1", NOW).expect("a flow")
}

fn signed_in() -> Outcome {
    Outcome::SignedIn {
        user_id: "u1".into(),
        created: false,
    }
}

fn waiting() -> Outcome {
    Outcome::Waiting(
        Waiting::Requested { filed: true },
        Identity {
            issuer: "https://id.test".into(),
            person: Person {
                subject: "sub-lea".into(),
                username: None,
                email: None,
                name: None,
                groups: Vec::new(),
            },
        },
    )
}

fn back(flows: &Flows, started: &Started, outcome: Outcome) -> String {
    flows.arrive(&started.state, NOW).expect("the flow");
    flows.settle(&started.id, outcome).expect("a code")
}

#[test]
fn a_flow_carries_what_the_callback_needs_and_a_challenge_of_its_verifier() {
    let flows = Flows::default();

    let started = started(&flows);
    let flow = flows.arrive(&started.state, NOW).unwrap();

    assert_eq!(flow.id, started.id);
    assert_eq!(flow.nonce, started.nonce);
    assert_eq!(challenge_of(&flow.verifier), started.challenge);
    assert_eq!(flow.redirect_uri, "https://kroma.test/api/auth/sso/callback");
}

#[test]
fn the_challenge_is_the_one_rfc_7636_gives_for_its_example_verifier() {
    assert_eq!(
        challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}

#[test]
fn a_state_answers_one_arrival_only() {
    let flows = Flows::default();
    let started = started(&flows);

    assert!(flows.arrive(&started.state, NOW).is_some());

    assert!(flows.arrive(&started.state, NOW).is_none());
    assert!(flows.arrive("made-up", NOW).is_none());
}

#[test]
fn an_outcome_is_collected_with_both_halves_and_only_once() {
    let flows = Flows::default();
    let started = started(&flows);
    let code = back(&flows, &started, signed_in());

    let first = flows.collect(&started.id, &started.secret, &code, NOW);
    let second = flows.collect(&started.id, &started.secret, &code, NOW);

    assert!(matches!(first, Collected::Done(done) if done.1 == signed_in()));
    assert_eq!(second, Collected::Unknown);
}

#[test]
fn whoever_started_a_flow_cannot_collect_without_the_code_the_browser_carried() {
    let flows = Flows::default();
    let started = started(&flows);
    back(&flows, &started, signed_in());

    let stolen = flows.collect(&started.id, &started.secret, "guessed", NOW);

    assert_eq!(stolen, Collected::Unknown);
}

#[test]
fn whoever_holds_the_code_cannot_collect_without_the_secret_the_start_returned() {
    let flows = Flows::default();
    let started = started(&flows);
    let code = back(&flows, &started, signed_in());

    let stolen = flows.collect(&started.id, "guessed", &code, NOW);

    assert_eq!(stolen, Collected::Unknown);
}

#[test]
fn a_flow_still_at_the_provider_is_pending_for_its_owner() {
    let flows = Flows::default();
    let started = started(&flows);

    assert_eq!(
        flows.collect(&started.id, &started.secret, "", NOW),
        Collected::Pending
    );

    flows.arrive(&started.state, NOW);
    assert_eq!(
        flows.collect(&started.id, &started.secret, "", NOW),
        Collected::Pending
    );
}

#[test]
fn an_outcome_cannot_be_parked_twice_or_before_the_person_is_back() {
    let flows = Flows::default();
    let started = started(&flows);

    assert!(flows.settle(&started.id, signed_in()).is_none());

    back(&flows, &started, signed_in());
    assert!(flows.settle(&started.id, signed_in()).is_none());
    assert!(flows.settle("made-up", signed_in()).is_none());
}

#[test]
fn an_identity_waiting_to_be_claimed_stays_until_the_flow_is_closed() {
    let flows = Flows::default();
    let started = started(&flows);
    let code = back(&flows, &started, waiting());

    let first = flows.collect(&started.id, &started.secret, &code, NOW);
    let again = flows.collect(&started.id, &started.secret, &code, NOW);
    flows.close(&started.id);

    assert!(matches!(first, Collected::Done(..)));
    assert_eq!(first, again);
    assert_eq!(
        flows.collect(&started.id, &started.secret, &code, NOW),
        Collected::Unknown
    );
}

#[test]
fn a_flow_lapses_after_ten_minutes_wherever_it_stands() {
    let flows = Flows::default();
    let at_provider = started(&flows);
    let returned = started(&flows);
    let code = back(&flows, &returned, Outcome::Refused(Refusal::Group));
    let later = NOW + FLOW_TTL_SECS;

    assert!(flows.arrive(&at_provider.state, later).is_none());
    assert_eq!(
        flows.collect(&returned.id, &returned.secret, &code, later),
        Collected::Unknown
    );
}

#[test]
fn one_address_cannot_hold_more_than_its_share_of_open_flows() {
    let flows = Flows::default();
    for _ in 0..MAX_OPEN_PER_ADDRESS {
        started(&flows);
    }

    assert!(flows.start(new_flow(), "10.0.0.1", NOW).is_none());
    assert!(flows.start(new_flow(), "10.0.0.2", NOW).is_some());
    assert!(flows
        .start(new_flow(), "10.0.0.1", NOW + FLOW_TTL_SECS)
        .is_some());
}

#[test]
fn a_full_store_refuses_the_next_start() {
    let flows = Flows::default();
    for n in 0..MAX_OPEN {
        flows
            .start(new_flow(), &format!("address-{n}"), NOW)
            .expect("room");
    }

    assert!(flows.start(new_flow(), "one-more", NOW).is_none());
}
