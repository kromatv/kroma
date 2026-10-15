use super::*;
use crate::test_support::test_state;
use std::sync::atomic::{AtomicUsize, Ordering};

fn enable(state: &SharedState) {
    state
        .settings
        .set_patch(&state.db, [(ENABLED_KEY.to_string(), json!(true))].into());
}

fn switch_off(state: &SharedState) {
    state
        .settings
        .set_patch(&state.db, [(ENABLED_KEY.to_string(), json!(false))].into());
}

#[test]
fn an_install_whose_operator_switched_it_off_sends_nothing() {
    let state = test_state();
    switch_off(&state);
    let calls = AtomicUsize::new(0);

    let report = report(&state, |_, _| {
        calls.fetch_add(1, Ordering::SeqCst);
        Ok(Outcome::Accepted)
    })
    .unwrap();

    assert_eq!(report, Report::Off);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert_eq!(state.settings.get_str(SENT_KEY, ""), "");
}

#[test]
fn statistics_are_on_until_somebody_turns_them_off() {
    let state = test_state();

    assert!(state.settings.get_bool(ENABLED_KEY, false));
    assert_eq!(
        state.settings.get_str(ID_KEY, "").len(),
        64,
        "the identifier exists from boot, because the settings page shows it"
    );
}

#[test]
fn opting_in_mints_one_id_and_keeps_it_across_runs() {
    let state = test_state();
    enable(&state);

    report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();
    let first = state.settings.get_str(ID_KEY, "");
    state
        .settings
        .set_internal(&state.db, SENT_KEY, json!(""))
        .unwrap();
    report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();

    assert_eq!(first.len(), 64);
    assert_ne!(first, state.instance_id);
    assert_eq!(state.settings.get_str(ID_KEY, ""), first);
}

#[test]
fn no_caller_can_choose_the_stats_id_through_the_settings_patch() {
    let state = test_state();
    enable(&state);
    report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();
    let minted = state.settings.get_str(ID_KEY, "");

    let written = state
        .settings
        .set_patch(&state.db, [(ID_KEY.to_string(), json!("chosen"))].into());

    assert!(
        written.is_empty(),
        "the allow-list let it through: {written:?}"
    );
    assert_eq!(state.settings.get_str(ID_KEY, ""), minted);
}

#[test]
fn a_run_that_was_accepted_stamps_when_it_happened() {
    let state = test_state();
    enable(&state);

    let report = report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();

    assert!(matches!(report, Report::Sent(_)));
    assert!(!state.settings.get_str(SENT_KEY, "").is_empty());
}

#[test]
fn a_payload_the_collector_will_not_take_is_reported_and_never_raised() {
    let state = test_state();
    enable(&state);

    let report = report(&state, |_, _| Ok(Outcome::Refused(400))).unwrap();

    assert_eq!(report, Report::Refused(400));
    assert!(
        !state.settings.get_str(SENT_KEY, "").is_empty(),
        "a refusal an operator cannot act on must back off to daily, not retry hourly"
    );
}

#[test]
fn a_wobble_at_the_far_end_defers_rather_than_pretending_it_landed() {
    let state = test_state();
    enable(&state);

    let report = report(&state, |_, _| Ok(Outcome::Transient(503))).unwrap();

    assert_eq!(report, Report::Deferred(503));
    assert_eq!(state.settings.get_str(SENT_KEY, ""), "");
}

// The one seam the tests above stub out: `post` actually speaking HTTP.
// Ignored because it needs a collector; run it against a local one with
//   cd packages/stats-relay/worker && bunx wrangler dev
//   cargo test -p kroma-engine stats -- --ignored --nocapture
#[test]
#[ignore = "needs a collector at KROMA_STATS_URL"]
fn a_real_collector_accepts_what_this_server_actually_sends() {
    let state = test_state();
    enable(&state);

    let report = run(&state).unwrap();

    assert!(matches!(report, Report::Sent(_)), "{report:?}");
    assert!(!state.settings.get_str(SENT_KEY, "").is_empty());
}

#[test]
fn the_payload_goes_to_the_ping_route_of_the_one_address_every_server_uses() {
    let state = test_state();
    enable(&state);

    let mut seen = String::new();
    report(&state, |url, _| {
        seen = url.to_string();
        Ok(Outcome::Accepted)
    })
    .unwrap();

    assert!(seen.ends_with("/v1/ping"), "{seen}");
    assert!(!seen.contains("//v1"), "{seen}");
}
