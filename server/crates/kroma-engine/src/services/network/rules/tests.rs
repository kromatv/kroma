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
    assert_eq!(rules.rules[0].action, Action::Vpn);
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
fn an_unknown_action_or_field_does_not_parse() {
    for body in [
        json!({ "defaultAction": "maybe", "rules": [] }),
        json!({ "defaultAction": "allow", "rules": [], "extra": 1 }),
        json!({ "defaultAction": "allow", "rules": [{ "id": "r", "action": "tunnel" }] }),
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
