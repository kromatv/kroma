use super::*;

const CREDENTIAL_WORDS: [&str; 4] = ["password", "token", "secret", "credential"];
const CREDENTIAL_COMPOUNDS: [&str; 4] = ["apikey", "privatekey", "serviceaccount", "keyp8"];
const MODULE_CREDENTIALS: [&str; 2] = ["vpnWgConfig", "remoteAccessToken"];

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
fn every_key_that_carries_a_default_declares_who_may_reach_it() {
    let declared = declared();

    let undeclared: Vec<&String> = declared
        .values
        .keys()
        .filter(|key| !declared.reach.contains_key(key.as_str()))
        .collect();

    assert!(
        undeclared.is_empty(),
        "a key reaches the store through core_only() or module_declared(), each of \
         which declares a reach: {undeclared:?}"
    );
}

#[test]
fn a_key_that_reads_like_a_credential_is_the_cores_unless_a_module_runs_on_it() {
    let declared = declared();

    let handed_out: Vec<&&str> = declared
        .reach
        .iter()
        .filter(|(key, reach)| {
            reads_like_a_credential(key)
                && **reach != SettingReach::CoreOnly
                && !MODULE_CREDENTIALS.contains(key)
        })
        .map(|(key, _)| key)
        .collect();

    assert!(
        handed_out.is_empty(),
        "a credential is the core's alone unless it is the one a module runs on; \
         declare these with core_only(): {handed_out:?}"
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
        assert_eq!(
            reach_of_setting(key),
            SettingReach::CoreOnly,
            "{key} must be the core's alone"
        );
    }
}

#[test]
fn the_blob_holding_every_modules_config_is_the_cores_alone() {
    assert_eq!(reach_of_setting("moduleStates"), SettingReach::CoreOnly);
    assert!(defaults().contains_key("moduleStates"));
}

// The word sweep cannot reach this one: "mediaTicketKey" carries no password,
// token, secret or credential word, so only a named case says it was thought
// about rather than caught.
#[test]
fn the_key_that_signs_a_media_ticket_is_the_cores_alone() {
    let key = crate::services::media_ticket::SIGNING_KEY_SETTING;

    assert_eq!(
        reach_of_setting(key),
        SettingReach::CoreOnly,
        "{key} forges a ticket for any device"
    );
    assert!(!reads_like_a_credential(key), "the sweep would cover it");
}

#[test]
fn the_identities_the_server_mints_for_itself_are_declared_and_withheld() {
    let declared = declared();

    for key in [
        "instanceId",
        crate::services::stats::ID_KEY,
        crate::services::stats::SENT_KEY,
    ] {
        assert_eq!(
            declared.reach.get(key),
            Some(&SettingReach::CoreOnly),
            "{key} is minted, not configured"
        );
        assert!(
            !declared.values.contains_key(key),
            "{key} carries no default, so no patch off the wire writes it"
        );
    }
}

#[test]
fn a_credential_and_a_preference_alike_reach_only_a_module_that_declares_them() {
    for key in MODULE_CREDENTIALS.into_iter().chain([
        "acqEnabled",
        "namingEpisodeFile",
        "notifications.vapid.publicKey",
        "smtpHost",
        "vpnLocalPort",
        "localDiscovery",
    ]) {
        assert_eq!(reach_of_setting(key), SettingReach::Declared, "{key}");
    }
}

#[test]
fn a_key_nothing_declares_reaches_no_module_whatever_it_is_called() {
    for key in ["neverDeclared", "aPlausiblePreference", ""] {
        assert_eq!(reach_of_setting(key), SettingReach::Unknown, "{key}");
    }
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

#[test]
fn a_key_naming_folders_a_module_holds_is_written_only_by_the_core_or_its_declarer() {
    assert_eq!(reach_of_setting("libraries"), SettingReach::CoreOnly);
    assert_eq!(reach_of_setting("downloadFolders"), SettingReach::CoreOnly);
    assert_eq!(reach_of_setting("acqRecycleBin"), SettingReach::Declared);
}
