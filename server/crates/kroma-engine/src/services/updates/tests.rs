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
    std::env::set_var("KROMA_UPDATES_URL", "http://127.0.0.1:9");

    let shown = check(&state).unwrap();

    assert_eq!(shown.latest.map(|l| l.version).as_deref(), Some("999.0.0"));
    assert!(shown.available);
    assert!(shown.error.is_some());
}
