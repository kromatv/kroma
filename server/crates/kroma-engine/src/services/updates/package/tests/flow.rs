use serde_json::json;

use super::super::*;
use super::support::*;
use crate::services::updates::{
    auto_install, install, package_of, recover, status, Channel, Target, AUTO_INSTALL_KEY,
    OPERATION_KEY,
};
use crate::test_support::{test_state, test_state_as_package};

#[test]
fn only_the_synology_package_updates_itself() {
    let package = test_state_as_package(&published(server_package()));
    let other = test_state();

    assert!(status(&package).installer.ready);
    assert!(!status(&other).installer.ready);
}

#[test]
fn the_package_installs_automatically_until_the_owner_says_otherwise() {
    let state = test_state_as_package(&published(server_package()));
    assert!(auto_install(&state));

    state.settings.set_patch(
        &state.db,
        [(AUTO_INSTALL_KEY.to_owned(), json!(false))].into(),
    );

    assert!(!auto_install(&state));
}

#[test]
fn an_update_unpacks_the_reviewed_build_beside_the_package_and_restarts() {
    let state = test_state_as_package(&published(server_package()));

    install(&state, target()).unwrap();
    let op = settled(&state);

    assert_eq!(op.phase, "restarting", "{:?}", op.message);
    assert!(is_payload(&releases(&state).join(BUILD.to_string())));
    assert!(!releases(&state)
        .join(format!("{BUILD}.spk.partial"))
        .exists());
    assert!(restart_requested());
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(wait_for_restart());
}

#[test]
fn a_package_that_does_not_match_its_digest_never_reaches_the_service_script() {
    let state = test_state_as_package(&feed(server_package(), "0".repeat(64)));

    install(&state, target()).unwrap();
    let op = settled(&state);

    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("checksum"));
    let left: Vec<_> = std::fs::read_dir(releases(&state)).unwrap().collect();
    assert!(left.is_empty());
}

#[test]
fn a_restart_that_came_back_on_the_previous_build_is_reported() {
    let state = test_state_as_package(&published(server_package()));
    let op = json!({
        "id": "restarted", "target": target(), "phase": "restarting",
        "message": null, "requestedAt": "2026-10-31T12:00:00Z", "automatic": true,
    });
    state
        .settings
        .set_internal(&state.db, OPERATION_KEY, op)
        .unwrap();

    recover(&state).unwrap();

    let op = status(&state).operation.unwrap();
    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("previous build"));
}

#[test]
fn a_build_already_unpacked_waits_for_the_last_viewer_before_restarting() {
    let state = test_state_as_package(&published(server_package()));
    unpacked(&state);
    someone_watches(&state);
    let mut op = operation(true);

    apply(&state, &mut op).unwrap();

    assert_eq!(op.phase, "deferred");
    assert_eq!(status(&state).operation.unwrap().phase, "deferred");
}

#[test]
fn an_automatic_update_that_meets_a_new_viewer_after_its_backup_waits() {
    let state = test_state_as_package(&published(server_package()));
    someone_watches(&state);
    let mut op = operation(true);

    crate::services::updates::install::prepare(&state, &mut op).unwrap();

    assert_eq!(op.phase, "deferred");
    assert!(!releases(&state).join(BUILD.to_string()).exists());
}

#[test]
fn a_canary_build_is_looked_up_on_the_rolling_release() {
    let state = test_state_as_package(&published(server_package()));
    let canary = Target {
        channel: Channel::Canary,
        ..target()
    };

    let package = package_of(&state, &canary).unwrap();

    assert!(package
        .url
        .ends_with(&format!("{BUILD}-{}.spk", std::env::consts::ARCH)));
}

#[test]
fn an_update_interrupted_before_its_payload_was_ready_can_be_retried() {
    let state = test_state_as_package(&published(server_package()));
    state
        .settings
        .set_internal(&state.db, OPERATION_KEY, json!(operation(false)))
        .unwrap();

    recover(&state).unwrap();

    let op = status(&state).operation.unwrap();
    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("before the update was ready"));
}
