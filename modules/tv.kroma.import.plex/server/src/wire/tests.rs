use serde_json::json;

use super::*;

fn read<T: serde::de::DeserializeOwned>(wire: serde_json::Value) -> T {
    serde_json::from_value(wire).expect("an ask the core sends reads")
}

#[test]
fn a_connect_ask_with_a_form_starts_a_sign_in_and_one_with_an_id_asks_again() {
    let form: ConnectAsk = read(json!({ "fields": { "url": "http://nas:32400" } }));
    let bare: ConnectAsk = read(json!({}));
    let again: ConnectAsk = read(json!({ "pending": "p-7" }));

    assert_eq!(form.pending, None);
    assert_eq!(bare.pending, None);
    assert_eq!(again.pending.as_deref(), Some("p-7"));
}

#[test]
fn a_survey_ask_names_a_sign_in_and_a_server() {
    let ask: SurveyAsk = read(json!({ "signIn": "s-1", "server": "srv" }));

    assert_eq!((ask.sign_in.as_str(), ask.server.as_str()), ("s-1", "srv"));
}

#[test]
fn a_titles_ask_reads_with_and_without_a_cursor() {
    let first: TitlesAsk =
        read(json!({ "signIn": "s-1", "server": "srv", "library": "1", "limit": 500 }));
    let later: TitlesAsk = read(json!({
        "signIn": "s-1", "server": "srv", "library": "1", "cursor": "c-1", "limit": 500,
    }));

    assert_eq!(first.cursor, None);
    assert_eq!(first.limit, Some(500));
    assert_eq!(later.cursor.as_deref(), Some("c-1"));
    assert_eq!(later.library, "1");
}

#[test]
fn a_states_ask_reads_its_user_and_the_time_to_start_from() {
    let ask: StatesAsk = read(json!({
        "signIn": "s-1", "server": "srv", "user": "42", "library": "1",
        "cursor": "c-1", "changedSince": 1_700_000_000, "limit": 500,
    }));

    assert_eq!(ask.user, "42");
    assert_eq!(ask.changed_since, Some(1_700_000_000));
    assert_eq!(ask.cursor.as_deref(), Some("c-1"));
}

#[test]
fn a_plays_ask_reads_with_nothing_but_a_sign_in_and_a_server() {
    let ask: PlaysAsk = read(json!({ "signIn": "s-1", "server": "srv" }));

    assert_eq!(ask.cursor, None);
    assert_eq!(ask.changed_since, None);
    assert_eq!(ask.limit, None);
}

#[test]
fn an_ask_from_a_later_core_reads_with_the_field_this_importer_does_not_know() {
    let ask: ForgetAsk = read(json!({ "signIn": "s-1", "reason": "the owner left Plex" }));

    assert_eq!(ask.sign_in, "s-1");
}

#[test]
fn an_ask_that_names_no_sign_in_is_not_read() {
    let ask = serde_json::from_value::<SurveyAsk>(json!({ "server": "srv" }));

    assert!(ask.is_err());
}

#[test]
fn a_ready_sign_in_is_this_json() {
    let ready = Connected::Ready {
        sign_in: "s-1".to_string(),
        servers: vec![
            ServerRef {
                id: "srv".to_string(),
                name: "Living room".to_string(),
                address: Some("http://192.168.1.20:32400".to_string()),
            },
            ServerRef {
                id: "far".to_string(),
                name: "Cabin".to_string(),
                address: None,
            },
        ],
    };

    let wire = serde_json::to_value(&ready).unwrap();

    assert_eq!(
        wire,
        json!({
            "status": "ready",
            "signIn": "s-1",
            "servers": [
                { "id": "srv", "name": "Living room", "address": "http://192.168.1.20:32400" },
                { "id": "far", "name": "Cabin" },
            ],
        })
    );
}

#[test]
fn a_pending_sign_in_is_this_json() {
    let pending = Connected::Pending {
        pending: "p-7".to_string(),
        url: "https://app.plex.tv/auth#?clientID=c&code=ABCD".to_string(),
        expires_at: 1_700_000_900,
    };

    let wire = serde_json::to_value(&pending).unwrap();

    assert_eq!(
        wire,
        json!({
            "status": "pending",
            "pending": "p-7",
            "url": "https://app.plex.tv/auth#?clientID=c&code=ABCD",
            "expiresAt": 1_700_000_900,
        })
    );
}

#[test]
fn each_refusal_is_a_reason_the_core_knows() {
    let reasons = [
        Refusal::Credentials,
        Refusal::Unreachable,
        Refusal::NotAdministrator,
        Refusal::Expired,
        Refusal::Other,
    ];

    let wire: Vec<serde_json::Value> = reasons
        .iter()
        .map(|reason| serde_json::to_value(Connected::Refused { reason: *reason }).unwrap())
        .collect();

    assert_eq!(
        wire,
        [
            "credentials",
            "unreachable",
            "notAdministrator",
            "expired",
            "other"
        ]
        .map(|reason| json!({ "status": "refused", "reason": reason }))
    );
}
