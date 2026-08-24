use kroma_module_host::HostCtx;

use super::*;

#[test]
fn a_distributions_own_credentials_take_precedence_over_a_stored_one() {
    let var = "KROMA_TEST_PUSH_KEY_ID";
    let state = crate::test_support::test_state();
    state.set_settings(std::collections::BTreeMap::from([(
        APNS_KEY_ID.to_string(),
        json!("  FROMTHEDB  "),
    )]));
    assert_eq!(from_env_or_setting(&state, var, APNS_KEY_ID), "FROMTHEDB");

    std::env::set_var(var, "  FROMTHEENV  ");
    assert_eq!(
        from_env_or_setting(&state, var, APNS_KEY_ID),
        "FROMTHEENV",
        "trimmed, and it wins"
    );

    std::env::set_var(var, "   ");
    assert_eq!(
        from_env_or_setting(&state, var, APNS_KEY_ID),
        "FROMTHEDB",
        "a blank variable is not a configured one"
    );
    std::env::remove_var(var);
}

#[test]
fn a_fork_can_rename_the_bundle_the_apple_push_is_addressed_to() {
    let state = crate::test_support::test_state();
    assert_eq!(credentials(&state).apns_topic, APNS_TOPIC);

    std::env::set_var("KROMA_APNS_TOPIC", "  tv.kroma.fork  ");
    assert_eq!(credentials(&state).apns_topic, "tv.kroma.fork");

    std::env::set_var("KROMA_APNS_TOPIC", "   ");
    assert_eq!(
        credentials(&state).apns_topic,
        APNS_TOPIC,
        "a blank one is not a rename"
    );
    std::env::remove_var("KROMA_APNS_TOPIC");
}

#[test]
fn an_unusable_apple_key_disables_ios_push_and_nothing_else() {
    let state = crate::test_support::test_state();
    public_key(&state).unwrap();
    state.set_settings(std::collections::BTreeMap::from([
        (
            APNS_KEY_P8.to_string(),
            json!("-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----"),
        ),
        (APNS_KEY_ID.to_string(), json!("ABC1234567")),
        (APNS_TEAM_ID.to_string(), json!("TEAM123456")),
    ]));

    let keys = keys_for(&credentials(&state));
    assert!(
        keys.apns.is_none(),
        "a .p8 that does not parse is not an identity"
    );
    assert!(keys.web.is_some(), "Web Push is independent of Apple");
}

#[test]
fn an_apple_key_that_parses_becomes_this_servers_ios_identity() {
    let state = crate::test_support::test_state();
    public_key(&state).unwrap();
    state.set_settings(std::collections::BTreeMap::from([
        (
            APNS_KEY_P8.to_string(),
            json!(crate::test_support::test_apns_key_p8()),
        ),
        (APNS_KEY_ID.to_string(), json!("ABC1234567")),
        (APNS_TEAM_ID.to_string(), json!("TEAM123456")),
    ]));

    let sender = sender(&state);
    assert!(sender.apns.is_some(), "the key should have become a sender");
    assert!(sender.has_own_credentials());
}

#[test]
fn unusable_google_credentials_disable_android_push_and_nothing_else() {
    let state = crate::test_support::test_state();
    public_key(&state).unwrap();
    for broken in [
        "{}",
        "not json at all",
        r#"{"project_id":"p","client_email":"e","private_key":"nope"}"#,
    ] {
        state.set_settings(std::collections::BTreeMap::from([(
            FCM_SERVICE_ACCOUNT.to_string(),
            json!(broken),
        )]));
        let keys = keys_for(&credentials(&state));
        assert!(keys.fcm.is_none(), "{broken} must not become an identity");
        assert!(keys.web.is_some());
    }
}

#[test]
fn the_public_key_is_minted_once_and_then_reused() {
    let state = crate::test_support::test_state();
    let first = public_key(&state).unwrap();
    assert!(!first.is_empty());
    assert_eq!(public_key(&state).unwrap(), first);
    assert_eq!(
        keys_for(&credentials(&state))
            .web
            .as_ref()
            .unwrap()
            .public_base64url(),
        first
    );
}
