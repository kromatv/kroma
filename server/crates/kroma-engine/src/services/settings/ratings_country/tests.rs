use std::collections::BTreeMap;

use serde_json::json;

use super::*;
use crate::db::{self, DeviceHints};
use crate::model::Permission;
use crate::state::SharedState;
use crate::test_support::test_state;

fn member(state: &SharedState, name: &str, device_language: Option<&str>) {
    let user = db::create_user(
        &state.db,
        &format!("{name}@x.test"),
        name,
        "h",
        &[Permission::Playback],
    )
    .unwrap();
    let hints = DeviceHints {
        language: device_language.map(str::to_string),
        ..DeviceHints::default()
    };
    db::create_access_token(
        &state.db,
        &format!("t-{name}"),
        &user.id,
        i64::MAX,
        false,
        &hints,
    )
    .unwrap();
}

fn household(state: &SharedState) -> String {
    household_country(&state.settings, &state.config, &state.db)
}

#[test]
fn an_admins_choice_is_the_households_country() {
    let state = test_state();
    member(&state, "owner", Some("fr-ch"));
    state.settings.set_patch(
        &state.db,
        BTreeMap::from([(RATINGS_COUNTRY_KEY.to_string(), json!("de"))]),
    );

    assert_eq!(household(&state), "DE");
}

#[test]
fn with_no_choice_the_household_takes_the_region_of_the_owners_locale() {
    let state = test_state();
    member(&state, "owner", Some("fr-ch"));
    member(&state, "guest", Some("en-gb"));

    assert_eq!(household(&state), "CH");
}

#[test]
fn an_owners_locale_with_no_region_leaves_the_country_of_the_metadata_language() {
    let state = test_state();
    member(&state, "owner", Some("fr"));

    assert_eq!(
        household(&state),
        metadata_country(&state.settings, &state.config)
    );
}

#[test]
fn a_region_no_rating_system_is_known_for_is_passed_over() {
    let state = test_state();
    member(&state, "owner", Some("fr-zz"));

    assert_eq!(
        household(&state),
        metadata_country(&state.settings, &state.config)
    );
    assert_eq!(known("zz"), None);
    assert_eq!(known(" ch "), Some("CH".to_string()));
}

#[test]
fn a_server_with_no_account_takes_the_country_of_the_metadata_language() {
    let state = test_state();

    assert_eq!(
        household(&state),
        metadata_country(&state.settings, &state.config)
    );
}
