use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    TestApp, installed_module, read_setting as read, store_settings as store, test_app,
    write_settings as write,
};

const HOST_TOKEN: &str = "test-host-token";

const BRIDGE: &str = "tv.kroma.bridge";

const CORE_ONLY: [&str; 6] = [
    "smtpPassword",
    "llmApiKey",
    "notifications.vapid.privateKey",
    "notifications.apns.keyP8",
    "notifications.fcm.serviceAccount",
    "moduleRegistryUrl",
];

fn bridge_declaring(t: &TestApp, settings: &str) -> String {
    installed_module(t, BRIDGE, &format!(r#", "settings": {settings}"#))
}

#[tokio::test]
async fn a_module_reads_and_writes_the_settings_it_declared() {
    let t = test_app();
    let token = bridge_declaring(
        &t,
        r#"{ "read": ["acqEnabled", "vpnWgConfig", "remoteAccessToken"],
             "write": ["acqEnabled", "vpnWgConfig"] }"#,
    );
    store(
        &t,
        &[
            ("vpnWgConfig", json!("[Interface]")),
            ("remoteAccessToken", json!("tunnel-token")),
        ],
    );

    let (wg_status, wg) = read(&t, &token, "vpnWgConfig").await;
    let (tunnel_status, tunnel) = read(&t, &token, "remoteAccessToken").await;
    let (write_status, _) = write(
        &t,
        &token,
        json!({ "acqEnabled": true, "vpnWgConfig": "[Peer]" }),
    )
    .await;

    assert_eq!(wg_status, StatusCode::OK);
    assert_eq!(wg, json!({ "value": "[Interface]" }));
    assert_eq!(tunnel_status, StatusCode::OK);
    assert_eq!(tunnel, json!({ "value": "tunnel-token" }));
    assert_eq!(write_status, StatusCode::NO_CONTENT);
    assert_eq!(t.state.settings.get("acqEnabled"), json!(true));
    assert_eq!(t.state.settings.get("vpnWgConfig"), json!("[Peer]"));
}

#[tokio::test]
async fn a_module_cannot_change_a_preference_it_did_not_declare() {
    let t = test_app();
    let token = bridge_declaring(&t, r#"{ "read": ["rqbitDownKbps"] }"#);

    let (status, body) = write(
        &t,
        &token,
        json!({ "rqbitDownKbps": 1, "namingMovieFolder": "{Title}" }),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        body["error"],
        r#"settings.write: "namingMovieFolder" is not declared; add it to settings.write in module.json"#
    );
    assert_eq!(t.state.settings.get("rqbitDownKbps"), json!(0));
    assert_eq!(
        t.state.settings.get("namingMovieFolder"),
        json!("{Title} ({Year})")
    );
}

#[tokio::test]
async fn a_module_cannot_read_a_preference_it_did_not_declare() {
    let t = test_app();
    let token = bridge_declaring(&t, r#"{ "write": ["vpnWgConfig"] }"#);
    store(
        &t,
        &[
            ("smtpHost", json!("mail.example")),
            ("vpnWgConfig", json!("[Interface]")),
        ],
    );

    let (host_status, host) = read(&t, &token, "smtpHost").await;
    let (wg_status, wg) = read(&t, &token, "vpnWgConfig").await;

    assert_eq!(host_status, StatusCode::FORBIDDEN);
    assert_eq!(
        host["error"],
        r#"settings.read: "smtpHost" is not declared; add it to settings.read in module.json"#
    );
    assert_eq!(
        wg_status,
        StatusCode::FORBIDDEN,
        "a write declaration is not a read declaration"
    );
    assert!(!wg.to_string().contains("[Interface]"));
}

#[tokio::test]
async fn a_module_with_no_settings_block_reaches_no_setting() {
    let t = test_app();
    let token = installed_module(&t, "com.example.silent", "");

    let (read_status, _) = read(&t, &token, "serverName").await;
    let (write_status, _) = write(&t, &token, json!({ "cacheLimit": "1 Go" })).await;

    assert_eq!(read_status, StatusCode::FORBIDDEN);
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert_eq!(t.state.settings.get("cacheLimit"), json!("80 Go"));
}

#[tokio::test]
async fn a_credential_the_core_keeps_is_refused_even_to_a_module_that_declares_it() {
    let t = test_app();
    let keys = serde_json::to_string(&CORE_ONLY).unwrap();
    let token = bridge_declaring(&t, &format!(r#"{{ "read": {keys}, "write": {keys} }}"#));
    store(
        &t,
        &CORE_ONLY.map(|key| (key, json!(format!("stored-{key}")))),
    );

    for key in CORE_ONLY {
        let (status, body) = read(&t, &token, key).await;

        assert_eq!(status, StatusCode::FORBIDDEN, "{key}");
        assert_eq!(
            body["error"],
            format!(
                r#"settings.read: "{key}" is the core's own and reaches no module, declared or not"#
            )
        );
        assert!(!body.to_string().contains("stored-"), "{key} leaked");
    }
    let (write_status, _) = write(&t, &token, json!({ "smtpPassword": "mine now" })).await;
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert_eq!(
        t.state.settings.get("smtpPassword"),
        json!("stored-smtpPassword")
    );
}

#[tokio::test]
async fn a_module_that_declares_the_folders_it_is_given_still_cannot_write_them() {
    let t = test_app();
    let token = bridge_declaring(
        &t,
        r#"{ "write": ["libraries", "downloadFolders", "acqRecycleBin"] }"#,
    );

    let (libraries, _) = write(&t, &token, json!({ "libraries": [{ "folders": ["/"] }] })).await;
    let (downloads, _) = write(&t, &token, json!({ "downloadFolders": "/" })).await;
    let (bin, _) = write(&t, &token, json!({ "acqRecycleBin": "/srv/bin" })).await;

    assert_eq!(libraries, StatusCode::FORBIDDEN);
    assert_eq!(downloads, StatusCode::FORBIDDEN);
    assert_eq!(t.state.settings.get("downloadFolders"), json!(""));
    assert_eq!(
        bin,
        StatusCode::NO_CONTENT,
        "the recycle bin goes to the module that declared it"
    );
}

#[tokio::test]
async fn the_key_that_signs_a_media_ticket_never_reaches_a_module() {
    let t = test_app();
    let key = crate::services::media_ticket::SIGNING_KEY_SETTING;
    let token = bridge_declaring(
        &t,
        &format!(r#"{{ "read": ["{key}"], "write": ["{key}"] }}"#),
    );
    let minted = t.state.media_ticket_key.clone();

    let (read_status, body) = read(&t, &token, key).await;
    let (write_status, _) = write(&t, &token, json!({ key: "a-key-the-module-knows" })).await;

    assert!(!minted.is_empty(), "the key is minted at boot");
    assert_eq!(read_status, StatusCode::FORBIDDEN);
    assert!(
        !body.to_string().contains(&minted),
        "a module holding it forges a ticket for any device"
    );
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert_eq!(t.state.settings.get_str(key, ""), minted);
}

#[tokio::test]
async fn an_identity_the_server_minted_for_itself_never_reaches_a_module() {
    let t = test_app();
    let instance = crate::services::settings::ensure_instance_id(&t.state.settings, &t.state.db);
    let stats = crate::services::settings::stats::ensure_identity(&t.state.settings, &t.state.db);
    let id_key = crate::services::stats::ID_KEY;
    let token = bridge_declaring(&t, &format!(r#"{{ "read": ["instanceId", "{id_key}"] }}"#));

    for key in ["instanceId", id_key] {
        let (status, body) = read(&t, &token, key).await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body.to_string().contains(&instance));
        assert!(!body.to_string().contains(&stats));
    }
}

#[tokio::test]
async fn a_key_no_declaration_names_is_withheld_in_both_directions() {
    let t = test_app();
    let token = bridge_declaring(
        &t,
        r#"{ "read": ["undeclaredSecret"], "write": ["undeclaredSecret"] }"#,
    );
    t.state
        .settings
        .set_internal(&t.state.db, "undeclaredSecret", json!("minted-by-nobody"))
        .unwrap();

    let (read_status, read_body) = read(&t, &token, "undeclaredSecret").await;
    let (write_status, _) = write(&t, &token, json!({ "undeclaredSecret": "mine now" })).await;

    assert_eq!(read_status, StatusCode::FORBIDDEN);
    assert_eq!(
        read_body["error"],
        r#"settings.read: "undeclaredSecret" is not a setting of this server"#
    );
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert_eq!(
        t.state.settings.get_str("undeclaredSecret", ""),
        "minted-by-nobody"
    );
}

#[tokio::test]
async fn the_fabric_token_names_no_module_and_reaches_no_setting() {
    let t = test_app();

    let (status, _) = read(&t, HOST_TOKEN, "serverName").await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

fn tcp_callback(token: &str, peer: [u8; 4]) -> axum::http::Request<axum::body::Body> {
    let mut req = axum::http::Request::builder()
        .method("GET")
        .uri("/api/_host/setting?key=serverName&kind=str&default=")
        .header("authorization", format!("Bearer {token}"))
        .body(axum::body::Body::empty())
        .unwrap();
    req.extensions_mut()
        .insert(axum::extract::ConnectInfo(std::net::SocketAddr::from((
            peer, 50000,
        ))));
    req
}

#[tokio::test]
async fn a_module_is_answered_on_the_socket_and_never_over_tcp() {
    use tower::ServiceExt;
    let t = test_app();
    let current = installed_module(
        &t,
        "com.example.current",
        r#", "settings": { "read": ["serverName"] }"#,
    );

    let over_tcp = t
        .app
        .clone()
        .oneshot(tcp_callback(&current, [127, 0, 0, 1]))
        .await
        .unwrap();
    let fabric_over_tcp = t
        .app
        .clone()
        .oneshot(tcp_callback(HOST_TOKEN, [127, 0, 0, 1]))
        .await
        .unwrap();
    let (on_socket, _) = read(&t, &current, "serverName").await;

    assert_eq!(over_tcp.status(), StatusCode::NOT_FOUND);
    assert_eq!(fabric_over_tcp.status(), StatusCode::NOT_FOUND);
    assert_eq!(on_socket, StatusCode::OK);
}
