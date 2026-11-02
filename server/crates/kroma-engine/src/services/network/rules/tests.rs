use serde_json::json;

use super::*;

fn one_rule(rule: Value) -> Result<NetworkRules, RulesError> {
    let rules: NetworkRules =
        serde_json::from_value(json!({ "defaultAction": "allow", "rules": [rule] })).unwrap();
    rules.validated()
}

fn code_for(rule: Value) -> &'static str {
    one_rule(rule).unwrap_err().code()
}

#[test]
fn a_valid_rule_is_kept_with_its_host_lowercased() {
    let rules = one_rule(json!({
        "id": "vpn-peers", "caller": "tv.kroma.torrents", "purpose": "peers-announce",
        "host": " *.Tracker.Example. ", "action": "vpn", "note": "Par le VPN"
    }))
    .unwrap();

    assert_eq!(rules.rules[0].host.as_deref(), Some("*.tracker.example"));
    assert_eq!(rules.rules[0].action, Action::Network("vpn".to_string()));
}

#[test]
fn each_malformed_field_is_refused_with_its_own_code() {
    let cases = [
        (
            json!({ "id": "", "caller": null, "purpose": null, "host": null, "action": "block", "note": null }),
            "invalid_rule_id",
        ),
        (
            json!({ "id": "a b", "caller": null, "purpose": null, "host": null, "action": "block", "note": null }),
            "invalid_rule_id",
        ),
        (
            json!({ "id": "r", "caller": "tv/kroma", "purpose": null, "host": null, "action": "block", "note": null }),
            "invalid_caller",
        ),
        (
            json!({ "id": "r", "caller": null, "purpose": "two words", "host": null, "action": "block", "note": null }),
            "invalid_purpose",
        ),
        (
            json!({ "id": "r", "caller": null, "purpose": null, "host": "*.", "action": "block", "note": null }),
            "invalid_host",
        ),
        (
            json!({ "id": "r", "caller": null, "purpose": null, "host": "a/b", "action": "block", "note": null }),
            "invalid_host",
        ),
        (
            json!({ "id": "r", "caller": null, "purpose": null, "host": "a.*.b", "action": "block", "note": null }),
            "invalid_host",
        ),
        (
            json!({ "id": "r", "caller": null, "purpose": null, "host": null, "action": "block", "note": "x".repeat(501) }),
            "invalid_note",
        ),
    ];

    for (rule, code) in cases {
        assert_eq!(code_for(rule.clone()), code, "{rule}");
    }
}

#[test]
fn two_rules_cannot_share_an_id() {
    let rule = json!({ "id": "r", "caller": null, "purpose": null, "host": null, "action": "block", "note": null });
    let rules: NetworkRules =
        serde_json::from_value(json!({ "defaultAction": "block", "rules": [rule, rule] })).unwrap();

    let refused = rules.validated().unwrap_err();

    assert_eq!(refused.code(), "duplicate_rule_id");
}

#[test]
fn more_rules_than_the_cap_are_refused() {
    let rule = |i: usize| Rule {
        id: format!("r{i}"),
        caller: None,
        purpose: None,
        host: None,
        port: None,
        address: None,
        action: Action::Block,
        note: None,
    };
    let rules = NetworkRules {
        default_action: DefaultAction::Allow,
        rules: (0..=MAX_RULES).map(rule).collect(),
    };

    assert_eq!(rules.validated().unwrap_err(), RulesError::TooManyRules);
}

#[test]
fn an_unknown_default_action_or_field_does_not_parse() {
    for body in [
        json!({ "defaultAction": "maybe", "rules": [] }),
        json!({ "defaultAction": "allow", "rules": [], "extra": 1 }),
    ] {
        assert!(
            serde_json::from_value::<NetworkRules>(body.clone()).is_err(),
            "{body}"
        );
    }
}

#[test]
fn a_stored_value_that_is_missing_or_invalid_reads_as_the_defaults() {
    for stored in [
        Value::Null,
        json!({ "defaultAction": "block" }),
        json!("garbage"),
    ] {
        assert_eq!(
            NetworkRules::from_setting(stored.clone()),
            NetworkRules::default(),
            "{stored}"
        );
    }
}

fn with_action(action: &str) -> Result<NetworkRules, RulesError> {
    serde_json::from_value::<NetworkRules>(serde_json::json!({
        "defaultAction": "allow",
        "rules": [{ "id": "a", "caller": null, "purpose": null, "host": null, "action": action, "note": null }]
    }))
    .unwrap()
    .validated()
}

#[test]
fn an_action_is_direct_block_or_the_name_of_a_network() {
    assert_eq!(with_action("direct").unwrap().rules[0].action, Action::Direct);
    assert_eq!(with_action("block").unwrap().rules[0].action, Action::Block);
    assert_eq!(
        with_action("vpn-ch").unwrap().rules[0].action,
        Action::Network("vpn-ch".to_string())
    );
}

#[test]
fn a_network_name_that_could_not_be_one_is_refused() {
    assert_eq!(
        with_action("a b").unwrap_err(),
        RulesError::InvalidNetwork("a b".to_string())
    );
}

#[test]
fn an_action_is_written_back_as_the_one_word_it_came_as() {
    let written = serde_json::to_value(Action::Network("vpn".to_string())).unwrap();

    assert_eq!(written, serde_json::json!("vpn"));
}

#[test]
fn an_address_range_that_is_not_one_is_refused() {
    let rules: NetworkRules = serde_json::from_value(serde_json::json!({
        "defaultAction": "allow",
        "rules": [{ "id": "a", "caller": null, "purpose": null, "host": null, "address": "10.0.0.0/99", "action": "block", "note": null }]
    }))
    .unwrap();

    assert_eq!(
        rules.validated().unwrap_err(),
        RulesError::InvalidAddress("10.0.0.0/99".to_string())
    );
}

