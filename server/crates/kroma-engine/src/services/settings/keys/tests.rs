use super::*;

const CREDENTIAL_WORDS: [&str; 4] = ["password", "token", "secret", "credential"];
const CREDENTIAL_COMPOUNDS: [&str; 4] = ["apikey", "privatekey", "serviceaccount", "keyp8"];

fn words(key: &str) -> Vec<String> {
    let mut spaced = String::new();
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            spaced.push(' ');
            spaced.push(c.to_ascii_lowercase());
        } else if c.is_ascii_alphanumeric() {
            spaced.push(c);
        } else {
            spaced.push(' ');
        }
    }
    spaced.split_whitespace().map(str::to_string).collect()
}

fn reads_like_a_credential(key: &str) -> bool {
    let words = words(key);
    let joined = words.concat();
    words.iter().any(|w| CREDENTIAL_WORDS.contains(&w.as_str()))
        || CREDENTIAL_COMPOUNDS.iter().any(|c| joined.contains(c))
}

#[test]
fn a_key_that_reads_like_a_credential_declares_who_may_reach_it() {
    let declared = declared();

    let undeclared: Vec<&String> = declared
        .values
        .keys()
        .filter(|key| reads_like_a_credential(key))
        .filter(|key| !declared.reach.contains_key(key.as_str()))
        .collect();

    assert!(
        undeclared.is_empty(),
        "a credential is the core's alone unless a sidecar configures it; \
         declare these with core_only() or sidecar_credential(): {undeclared:?}"
    );
}

#[test]
fn the_word_sweep_reads_a_credential_without_flagging_a_count_of_tokens() {
    assert!(reads_like_a_credential("smtpPassword"));
    assert!(reads_like_a_credential("remoteAccessToken"));
    assert!(reads_like_a_credential("llmApiKey"));
    assert!(reads_like_a_credential("notifications.apns.keyP8"));
    assert!(reads_like_a_credential("notifications.fcm.serviceAccount"));

    assert!(!reads_like_a_credential("llmMaxTokens"));
    assert!(!reads_like_a_credential("acqForbiddenKeywords"));
    assert!(!reads_like_a_credential("notifications.vapid.publicKey"));
}

#[test]
fn the_mail_llm_push_and_registry_keys_are_the_cores_alone() {
    for key in [
        "smtpPassword",
        "llmApiKey",
        "notifications.vapid.privateKey",
        "notifications.apns.keyP8",
        "notifications.apns.keyId",
        "notifications.apns.teamId",
        "notifications.fcm.serviceAccount",
        "moduleRegistries",
        "moduleRegistryUrl",
    ] {
        assert!(core_only(key), "{key} must be the core's alone");
    }
}

#[test]
fn a_credential_the_sidecar_that_uses_it_configures_stays_reachable() {
    assert!(!core_only("vpnWgConfig"));
    assert!(!core_only("remoteAccessToken"));
}

#[test]
fn an_ordinary_preference_and_an_unknown_key_are_not_withheld() {
    assert!(!core_only("acqEnabled"));
    assert!(!core_only("namingEpisodeFile"));
    assert!(!core_only("notifications.vapid.publicKey"));
    assert!(!core_only("smtpHost"));
    assert!(!core_only("neverDeclared"));
}

#[test]
fn defaults_carry_known_keys() {
    let d = defaults();
    assert_eq!(d.get("serverName"), Some(&json!("KROMA")));
    assert_eq!(d.get("moduleStates"), Some(&json!({})));
    assert_eq!(d.get("watchIntervalSecs"), Some(&json!(-1)));
    assert_eq!(d.get("llmTemperature"), Some(&json!(0.7)));
    assert_eq!(d.get("smtpPassword"), Some(&json!("")));
    assert!(!d.contains_key("nonexistentKey"));
}
