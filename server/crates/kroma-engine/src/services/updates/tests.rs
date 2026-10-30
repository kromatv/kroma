use serde_json::json;

use super::feed::{self, Release};
use super::*;
use crate::test_support::test_state;

fn release(value: serde_json::Value) -> Release {
    serde_json::from_value(value).unwrap()
}

fn canary_feed() -> Release {
    release(json!({
        "tag_name": "canary",
        "html_url": "https://github.com/kromatv/kroma/releases/tag/canary",
        "assets": [
            { "name": "kroma-0.1.39.3580000-x86_64.spk", "created_at": "2026-10-21T10:00:00Z" },
            { "name": "kroma-0.1.40.3571105-x86_64.spk", "created_at": "2026-10-19T10:00:00Z" },
            { "name": "kroma-0.1.40.3571174-x86_64.spk", "created_at": "2026-10-20T10:00:00Z" },
            { "name": "kroma-0.1.40.3571174-x86_64.spk.info.json" },
            { "name": "KROMA-tizen-0.1.40-canary.3571200.wgt" },
        ],
    }))
}

fn latest(version: &str, build: Option<u64>) -> Latest {
    Latest {
        version: version.into(),
        build,
        url: String::new(),
        published_at: None,
    }
}

#[test]
fn the_stable_feed_is_the_latest_release_tag() {
    let found = feed::stable(release(json!({
        "tag_name": "v0.1.38",
        "html_url": "https://github.com/kromatv/kroma/releases/tag/v0.1.38",
        "published_at": "2026-08-14T00:17:31Z",
    })));

    assert_eq!(
        found,
        Some(Latest {
            version: "0.1.38".into(),
            build: None,
            url: "https://github.com/kromatv/kroma/releases/tag/v0.1.38".into(),
            published_at: Some("2026-08-14T00:17:31Z".into()),
        })
    );
}

#[test]
fn a_tag_that_is_not_a_version_is_no_release() {
    let found = feed::stable(release(json!({ "tag_name": "canary", "html_url": "" })));

    assert_eq!(found, None);
}

#[test]
fn the_canary_feed_is_the_newest_server_package() {
    let found = feed::canary(canary_feed()).unwrap();

    assert_eq!(found.version, "0.1.40");
    assert_eq!(found.build, Some(3_571_174));
    assert_eq!(found.published_at.as_deref(), Some("2026-10-20T10:00:00Z"));
}

#[test]
fn a_higher_version_is_newer_whatever_the_builds() {
    assert!(is_newer(&latest("0.1.40", None), "0.1.39", 0));
    assert!(is_newer(&latest("0.1.40", Some(1)), "0.1.39", 9_999_999));
    assert!(!is_newer(&latest("0.1.38", None), "0.1.40", 3_571_174));
}

#[test]
fn a_canary_of_a_lower_version_is_never_offered() {
    assert!(!is_newer(
        &latest("0.1.39", Some(3_580_000)),
        "0.1.40",
        3_571_174
    ));
}

#[test]
fn the_same_version_is_ordered_by_build() {
    let newest = latest("0.1.40", Some(3_571_174));

    assert!(is_newer(&newest, "0.1.40", 3_571_105));
    assert!(!is_newer(&newest, "0.1.40", 3_571_174));
}

#[test]
fn a_release_is_newer_than_its_own_release_candidate() {
    assert!(is_newer(&latest("0.1.40", None), "0.1.40-rc1", 0));
}

#[test]
fn a_local_build_is_only_behind_a_higher_version() {
    assert!(!is_newer(&latest("0.1.40", Some(3_571_174)), "0.1.40", 0));
}

#[test]
fn the_stable_feed_reads_the_build_from_its_server_package() {
    let found = feed::stable(release(json!({
        "tag_name": "v0.1.40",
        "html_url": "https://github.com/kromatv/kroma/releases/tag/v0.1.40",
        "assets": [
            { "name": "kroma-0.1.40.3571174-x86_64.spk" },
            { "name": "kroma-0.1.40.3571174-x86_64.spk.info.json" },
            { "name": "KROMA_0.1.40_aarch64.dmg" },
        ],
    })));

    assert_eq!(found.and_then(|l| l.build), Some(3_571_174));
}

#[test]
fn a_result_for_another_channel_is_not_shown() {
    let state = test_state();
    let stored = Checked {
        channel: Channel::Canary,
        latest: Some(latest("0.1.40", Some(9))),
        checked_at: "2026-10-20T10:00:00Z".into(),
        error: None,
    };
    state
        .settings
        .set_internal(&state.db, STATUS_KEY, json!(stored))
        .unwrap();

    let shown = status(&state);

    assert_eq!(shown.channel, Channel::Stable);
    assert_eq!(shown.latest, None);
    assert_eq!(shown.checked_at, None);
}

#[test]
fn a_check_that_fails_keeps_the_last_answer_and_says_why() {
    let state = test_state();
    let stored = Checked {
        channel: Channel::Stable,
        latest: Some(latest("999.0.0", None)),
        checked_at: "2026-10-20T10:00:00Z".into(),
        error: None,
    };
    state
        .settings
        .set_internal(&state.db, STATUS_KEY, json!(stored))
        .unwrap();

    let shown = check(&state).unwrap();

    assert_eq!(shown.latest.map(|l| l.version).as_deref(), Some("999.0.0"));
    assert!(shown.available);
    assert!(shown.error.is_some());
}

fn feeds() -> String {
    let (base, _) = crate::test_support::serve_json(|path| match path {
        "/latest" => (
            200,
            json!({
                "tag_name": "v999.0.0",
                "html_url": "https://github.com/kromatv/kroma/releases/tag/v999.0.0",
                "assets": [{ "name": "kroma-999.0.0.3600000-x86_64.spk" }],
            }),
        ),
        "/tags/canary" => (
            200,
            json!({
                "tag_name": "canary",
                "html_url": "https://github.com/kromatv/kroma/releases/tag/canary",
                "assets": [{ "name": "kroma-999.0.0.3600001-x86_64.spk" }],
            }),
        ),
        _ => (404, json!({ "message": "Not Found" })),
    });
    base
}

#[test]
fn a_check_reads_the_stable_feed_and_offers_what_it_found() {
    let state = crate::test_support::test_state_with_releases(&feeds());

    let shown = check(&state).unwrap();

    assert_eq!(
        shown.latest.as_ref().map(|l| l.version.as_str()),
        Some("999.0.0")
    );
    assert_eq!(shown.latest.and_then(|l| l.build), Some(3_600_000));
    assert!(shown.available);
    assert!(shown.error.is_none());
}

#[test]
fn a_check_on_canary_reads_the_rolling_release() {
    let state = crate::test_support::test_state_with_releases(&feeds());
    state.settings.set_patch(
        &state.db,
        [(CHANNEL_KEY.to_string(), json!("Canary"))].into(),
    );

    let shown = check(&state).unwrap();

    assert_eq!(shown.channel, Channel::Canary);
    assert_eq!(shown.latest.and_then(|l| l.build), Some(3_600_001));
}

#[test]
fn a_feed_with_no_release_yet_offers_nothing() {
    let (base, _) = crate::test_support::serve_json(|_| (404, json!({ "message": "Not Found" })));
    let state = crate::test_support::test_state_with_releases(&base);

    let shown = check(&state).unwrap();

    assert!(shown.latest.is_none());
    assert!(shown.error.is_none());
    assert!(!shown.available);
}

fn updater() -> SharedState {
    let state = crate::test_support::test_state_with_updater(&feeds());
    let dir = state.config.update_dir.as_ref().unwrap();
    std::fs::create_dir_all(dir).unwrap();
    heartbeat(&state, "docker", 0);
    state
}

fn heartbeat(state: &SharedState, platform: &str, age: u64) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    std::fs::write(
        state
            .config
            .update_dir
            .as_ref()
            .unwrap()
            .join("heartbeat.json"),
        json!({"protocol": 1, "platform": platform, "timestamp": now - age}).to_string(),
    )
    .unwrap();
}

fn target() -> Target {
    Target {
        channel: Channel::Stable,
        version: "999.0.0".into(),
        build: 3_600_000,
    }
}

#[test]
fn an_update_saves_a_private_backup_before_queuing_the_reviewed_build() {
    let state = updater();
    let shown = install(&state, target()).unwrap();
    let op = shown.operation.unwrap();
    assert_eq!(op.phase, "queued");
    assert_eq!(op.target.build, 3_600_000);
    let backup = state
        .config
        .data_dir
        .join("update-backups")
        .join(format!("{}.zip", op.id));
    assert!(std::fs::read(&backup).unwrap().starts_with(b"PK"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(backup).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    assert!(install(&state, target())
        .unwrap_err()
        .to_string()
        .contains("already in progress"));
}

#[test]
fn an_offline_or_wrong_platform_updater_cannot_receive_an_install() {
    let state = updater();
    heartbeat(&state, "docker", 100);
    assert!(!status(&state).installer.ready);
    assert!(install(&state, target()).is_err());
    heartbeat(&state, "synology", 0);
    assert!(!status(&state).installer.ready);
}

#[test]
fn a_stale_review_or_another_channel_never_queues_an_update() {
    let state = updater();
    let mut asked = target();
    asked.build -= 1;
    assert!(install(&state, asked).is_err());
    let mut asked = target();
    asked.channel = Channel::Canary;
    assert!(install(&state, asked).is_err());
    assert!(status(&state).operation.is_none());
}

#[test]
fn a_result_for_an_older_request_does_not_finish_the_current_operation() {
    let state = updater();
    let op = install(&state, target()).unwrap().operation.unwrap();
    let dir = state.config.update_dir.as_ref().unwrap();
    let mut old = op.clone();
    old.id = "old".into();
    old.phase = "complete".into();
    std::fs::write(dir.join("result.json"), serde_json::to_vec(&old).unwrap()).unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "queued");
    old.id = op.id;
    old.phase = "failed".into();
    std::fs::write(dir.join("result.json"), serde_json::to_vec(&old).unwrap()).unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "failed");
    assert!(install(&state, target()).is_ok());
}

fn enable_automatic(state: &SharedState) {
    state.settings.set_patch(
        &state.db,
        [(AUTO_INSTALL_KEY.to_owned(), json!(true))].into(),
    );
}

#[test]
fn automatic_installation_is_opt_in_and_marks_its_request() {
    let state = updater();
    check(&state).unwrap();
    assert!(install_automatically(&state).unwrap().is_none());
    assert!(status(&state).operation.is_none());
    enable_automatic(&state);
    let op = install_automatically(&state)
        .unwrap()
        .unwrap()
        .operation
        .unwrap();
    assert!(op.automatic);
    assert_eq!(op.phase, "queued");
}

#[test]
fn automatic_installation_waits_for_playing_or_paused_sessions() {
    let state = updater();
    enable_automatic(&state);
    check(&state).unwrap();
    state.playback.upsert(
        crate::services::playback::Ping {
            session_id: "watching".into(),
            item_id: "movie".into(),
            position_ms: 0,
            duration_ms: None,
            state: "paused".into(),
            mode: "direct".into(),
            player: "web".into(),
            device: "browser".into(),
            audio: None,
            subtitle: None,
        },
        None,
        "viewer".into(),
        "127.0.0.1".into(),
        "LAN".into(),
        None,
    );
    assert!(install_automatically(&state).unwrap().is_none());
    assert!(status(&state).operation.is_none());
    state.playback.remove("watching");
    assert!(install_automatically(&state).unwrap().is_some());
}

#[test]
fn a_failed_build_is_not_retried_automatically() {
    let state = updater();
    enable_automatic(&state);
    check(&state).unwrap();
    let mut op = install_automatically(&state)
        .unwrap()
        .unwrap()
        .operation
        .unwrap();
    op.phase = "failed".into();
    std::fs::write(
        state
            .config
            .update_dir
            .as_ref()
            .unwrap()
            .join("result.json"),
        serde_json::to_vec(&op).unwrap(),
    )
    .unwrap();
    assert!(install_automatically(&state).unwrap().is_none());
    assert!(install(&state, target()).is_ok());
}

#[test]
fn a_backup_interrupted_by_restart_can_be_retried() {
    let state = updater();
    state
        .settings
        .set_internal(
            &state.db,
            OPERATION_KEY,
            json!({
                "id": "interrupted", "target": target(), "phase": "backing_up",
                "message": null, "requestedAt": "2026-10-29T12:00:00Z", "automatic": false,
            }),
        )
        .unwrap();
    recover(&state).unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "failed");
    assert!(install(&state, target()).is_ok());
}

#[test]
fn a_backup_write_failure_never_reaches_the_host() {
    let state = updater();
    std::fs::write(state.config.data_dir.join("update-backups"), b"blocked").unwrap();

    assert!(install(&state, target()).is_err());

    let op = status(&state).operation.unwrap();
    assert_eq!(op.phase, "failed");
    assert!(op.message.unwrap().contains("could not be prepared"));
    assert!(!state
        .config
        .update_dir
        .as_ref()
        .unwrap()
        .join("request.json")
        .exists());
}

#[test]
fn a_request_publication_failure_is_persisted_for_manual_retry() {
    let state = updater();
    let dir = state.config.update_dir.as_ref().unwrap();
    std::fs::create_dir(dir.join("request.tmp")).unwrap();

    assert!(install(&state, target()).is_err());
    assert_eq!(status(&state).operation.unwrap().phase, "failed");
    assert!(!dir.join("request.json").exists());

    std::fs::remove_dir(dir.join("request.tmp")).unwrap();
    assert!(install(&state, target()).is_ok());
}

#[test]
fn recovery_leaves_published_requests_to_the_host_but_fails_unpublished_ones() {
    let state = updater();
    let mut op = install(&state, target()).unwrap().operation.unwrap();
    recover(&state).unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "queued");

    std::fs::remove_file(
        state
            .config
            .update_dir
            .as_ref()
            .unwrap()
            .join("request.json"),
    )
    .unwrap();
    recover(&state).unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "failed");

    let build = crate::services::settings::build_info();
    op.target.version = build.version;
    op.target.build = build.number;
    state
        .settings
        .set_internal(&state.db, OPERATION_KEY, json!(op))
        .unwrap();
    assert_eq!(status(&state).operation.unwrap().phase, "complete");
    recover(&test_state()).unwrap();
}
