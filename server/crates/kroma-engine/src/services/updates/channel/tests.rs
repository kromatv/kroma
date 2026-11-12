use serde_json::json;

use super::*;
use crate::test_support::{serve_json, test_state};

fn released_as(build: u64) -> String {
    let (base, _) = serve_json(move |path| match path {
        "/tags/v0.1.39" => (
            200,
            json!({
                "tag_name": "v0.1.39",
                "html_url": "https://github.com/kromatv/kroma/releases/tag/v0.1.39",
                "assets": [{ "name": format!("kroma-0.1.39.{build}-x86_64.spk") }],
            }),
        ),
        _ => (404, json!({ "message": "Not Found" })),
    });
    base
}

#[test]
fn a_build_no_stable_release_ships_follows_canary_until_the_owner_chooses() {
    let state = test_state();
    let base = released_as(3_592_000);

    detect(&state, &base, "0.1.39", 3_592_322);

    assert_eq!(channel_for(&state.settings, 3_592_322), Channel::Canary);
    assert_eq!(channel_for(&state.settings, 3_592_400), Channel::Stable);
    state.settings.set_patch(
        &state.db,
        [(CHANNEL_KEY.to_string(), json!("Stable"))].into(),
    );
    assert_eq!(channel_for(&state.settings, 3_592_322), Channel::Stable);
}

#[test]
fn the_build_a_stable_release_ships_follows_stable() {
    let state = test_state();

    detect(&state, &released_as(3_592_000), "0.1.39", 3_592_000);

    assert_eq!(channel_for(&state.settings, 3_592_000), Channel::Stable);
}

#[test]
fn a_version_with_no_release_yet_is_a_canary() {
    let state = test_state();

    detect(&state, &released_as(3_592_000), "0.1.40", 3_600_000);

    assert_eq!(channel_for(&state.settings, 3_600_000), Channel::Canary);
}

#[test]
fn a_feed_that_cannot_answer_leaves_the_channel_undecided() {
    let state = test_state();
    let (base, _) = serve_json(|_| (500, json!({})));

    detect(&state, &base, "0.1.39", 3_592_322);

    assert_eq!(channel_for(&state.settings, 3_592_322), Channel::Stable);
    assert!(state.settings.get(DETECTED_KEY).is_null());
}
