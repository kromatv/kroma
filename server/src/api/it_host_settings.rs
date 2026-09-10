//! The `/api/_host/*` settings callbacks against the real wiring: which keys a
//! sidecar holding the host token reads and writes.

use std::collections::BTreeMap;

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, send, test_app};

const HOST_TOKEN: &str = "test-host-token";

#[tokio::test]
async fn a_stored_operator_credential_never_reaches_a_sidecar() {
    let t = test_app();
    t.state.settings.set_patch(
        &t.state.db,
        BTreeMap::from([
            ("smtpPassword".to_string(), json!("mail-s3cr3t")),
            ("llmApiKey".to_string(), json!("sk-llm")),
            (
                "notifications.vapid.privateKey".to_string(),
                json!("vapid-private"),
            ),
            ("notifications.apns.keyP8".to_string(), json!("apns-p8")),
            (
                "notifications.fcm.serviceAccount".to_string(),
                json!("fcm-account"),
            ),
            ("moduleRegistryUrl".to_string(), json!("https://mine.test")),
        ]),
    );

    for (key, stored) in [
        ("smtpPassword", "mail-s3cr3t"),
        ("llmApiKey", "sk-llm"),
        ("notifications.vapid.privateKey", "vapid-private"),
        ("notifications.apns.keyP8", "apns-p8"),
        ("notifications.fcm.serviceAccount", "fcm-account"),
        ("moduleRegistryUrl", "https://mine.test"),
    ] {
        let uri = format!("/api/_host/setting?key={key}&kind=str&default=");
        let (status, body) = get(&t.app, &uri, Some(HOST_TOKEN)).await;

        assert_eq!(status, StatusCode::OK, "{key}");
        assert_eq!(body, json!({ "value": "" }), "{key} leaked");
        assert!(!body.to_string().contains(stored), "{key} leaked");
    }
}

#[tokio::test]
async fn the_key_that_signs_a_media_ticket_never_reaches_a_sidecar() {
    let t = test_app();
    let minted = t.state.media_ticket_key.clone();
    let key = crate::services::media_ticket::SIGNING_KEY_SETTING;

    let uri = format!("/api/_host/setting?key={key}&kind=str&default=");
    let (status, body) = get(&t.app, &uri, Some(HOST_TOKEN)).await;

    assert!(!minted.is_empty(), "the key is minted at boot");
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "value": "" }));
    assert!(
        !body.to_string().contains(&minted),
        "a sidecar holding it forges a ticket for any device"
    );
}

#[tokio::test]
async fn a_sidecar_cannot_put_a_signing_key_of_its_own_choosing_in_place() {
    let t = test_app();
    let minted = t.state.media_ticket_key.clone();
    let key = crate::services::media_ticket::SIGNING_KEY_SETTING;

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/_host/settings",
        Some(HOST_TOKEN),
        Some(json!({ "patch": { key: "a-key-the-module-knows" } })),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(t.state.settings.get_str(key, ""), minted);
}

#[tokio::test]
async fn the_settings_a_module_runs_on_still_come_back_stored() {
    let t = test_app();
    t.state.settings.set_patch(
        &t.state.db,
        BTreeMap::from([
            ("acqEnabled".to_string(), json!(true)),
            ("vpnWgConfig".to_string(), json!("[Interface]")),
            ("remoteAccessToken".to_string(), json!("tunnel-token")),
        ]),
    );

    let (acq_status, acq) = get(
        &t.app,
        "/api/_host/setting?key=acqEnabled&kind=bool&default=false",
        Some(HOST_TOKEN),
    )
    .await;
    let (wg_status, wg) = get(
        &t.app,
        "/api/_host/setting?key=vpnWgConfig&kind=str&default=",
        Some(HOST_TOKEN),
    )
    .await;
    let (tunnel_status, tunnel) = get(
        &t.app,
        "/api/_host/setting?key=remoteAccessToken&kind=str&default=",
        Some(HOST_TOKEN),
    )
    .await;

    assert_eq!(acq_status, StatusCode::OK);
    assert_eq!(acq, json!({ "value": true }));
    assert_eq!(wg_status, StatusCode::OK);
    assert_eq!(wg, json!({ "value": "[Interface]" }));
    assert_eq!(tunnel_status, StatusCode::OK);
    assert_eq!(tunnel, json!({ "value": "tunnel-token" }));
}

#[tokio::test]
async fn a_sidecar_cannot_write_a_credential_or_retarget_the_registries() {
    let t = test_app();

    let (password, _) = send(
        &t.app,
        "POST",
        "/api/_host/settings",
        Some(HOST_TOKEN),
        Some(json!({ "patch": { "smtpPassword": "mine now" } })),
    )
    .await;
    let (registries, _) = send(
        &t.app,
        "POST",
        "/api/_host/settings",
        Some(HOST_TOKEN),
        Some(json!({ "patch": {
            "cacheLimit": "1 Go",
            "moduleRegistries": [{ "name": "mine", "url": "https://mine.test", "enabled": true }],
        } })),
    )
    .await;

    assert_eq!(password, StatusCode::FORBIDDEN);
    assert_eq!(registries, StatusCode::FORBIDDEN);
    assert_eq!(t.state.settings.get("smtpPassword"), json!(""));
    assert_eq!(t.state.settings.get("moduleRegistries"), json!([]));
    assert_eq!(
        t.state.settings.get("cacheLimit"),
        json!("80 Go"),
        "a refused patch writes none of its keys"
    );
}

#[tokio::test]
async fn a_sidecar_still_saves_the_settings_it_owns() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/_host/settings",
        Some(HOST_TOKEN),
        Some(json!({ "patch": { "acqEnabled": true, "vpnWgConfig": "[Interface]" } })),
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(t.state.settings.get("acqEnabled"), json!(true));
    assert_eq!(t.state.settings.get("vpnWgConfig"), json!("[Interface]"));
}

#[tokio::test]
async fn an_identity_the_server_minted_for_itself_never_reaches_a_sidecar() {
    let t = test_app();
    let instance = crate::services::settings::ensure_instance_id(&t.state.settings, &t.state.db);
    let stats = crate::services::settings::stats::ensure_identity(&t.state.settings, &t.state.db);

    let mut answers = Vec::new();
    for key in ["instanceId", crate::services::stats::ID_KEY] {
        let uri = format!("/api/_host/setting?key={key}&kind=str&default=");
        answers.push(get(&t.app, &uri, Some(HOST_TOKEN)).await);
    }

    assert!(!instance.is_empty() && !stats.is_empty(), "both are minted");
    for (status, body) in &answers {
        assert_eq!(*status, StatusCode::OK);
        assert_eq!(*body, json!({ "value": "" }));
        assert!(!body.to_string().contains(&instance));
        assert!(!body.to_string().contains(&stats));
    }
}

#[tokio::test]
async fn a_key_no_declaration_names_is_withheld_in_both_directions() {
    let t = test_app();
    t.state
        .settings
        .set_internal(&t.state.db, "undeclaredSecret", json!("minted-by-nobody"));

    let (read_status, read) = get(
        &t.app,
        "/api/_host/setting?key=undeclaredSecret&kind=str&default=",
        Some(HOST_TOKEN),
    )
    .await;
    let (write_status, _) = send(
        &t.app,
        "POST",
        "/api/_host/settings",
        Some(HOST_TOKEN),
        Some(json!({ "patch": { "undeclaredSecret": "mine now" } })),
    )
    .await;

    assert_eq!(read_status, StatusCode::OK);
    assert_eq!(read, json!({ "value": "" }));
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert_eq!(
        t.state.settings.get_str("undeclaredSecret", ""),
        "minted-by-nobody"
    );
}
