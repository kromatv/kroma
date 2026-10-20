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
fn stable_compares_versions_and_ignores_a_prerelease_suffix() {
    assert!(is_newer(Channel::Stable, &latest("0.1.40", None), "0.1.39", 0));
    assert!(!is_newer(Channel::Stable, &latest("0.1.38", None), "0.1.40", 3_571_174));
    assert!(!is_newer(Channel::Stable, &latest("0.1.40", None), "0.1.40-rc1", 0));
}

#[test]
fn canary_compares_build_numbers_and_never_nags_a_local_build() {
    let newest = latest("0.1.40", Some(3_571_174));

    assert!(is_newer(Channel::Canary, &newest, "0.1.40", 3_571_105));
    assert!(!is_newer(Channel::Canary, &newest, "0.1.40", 3_571_174));
    assert!(!is_newer(Channel::Canary, &newest, "0.1.40", 0));
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
