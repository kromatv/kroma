use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{get, raw, seed_session, send, test_app};
use crate::model::Permission;

const READS: [&str; 5] = [
    "/api/admin/network/flows",
    "/api/admin/network/summary",
    "/api/admin/network/inbound",
    "/api/admin/network/rules",
    "/api/admin/network/listeners",
];

fn rules_blocking(purpose: &str) -> Value {
    json!({
        "defaultAction": "allow",
        "rules": [{
            "id": "it-block", "caller": "core", "purpose": purpose, "host": null,
            "action": "block", "note": "Bloqué pour le test"
        }]
    })
}

#[tokio::test]
async fn an_admin_without_the_settings_capability_reaches_no_network_route() {
    let t = test_app();
    let (_id, users_admin) = seed_session(
        &t.state,
        "users-admin@test.dev",
        "users-admin",
        &[Permission::UsersManage],
    );

    for uri in READS {
        let (status, _) = get(&t.app, uri, Some(&users_admin)).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{uri}");
        let (status, _) = get(&t.app, uri, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri}");
    }
    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&users_admin),
        Some(rules_blocking("stats")),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn rules_written_read_back_with_the_purposes_the_page_can_offer() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&t.token),
        Some(rules_blocking("stats")),
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, body) = get(&t.app, "/api/admin/network/rules", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["defaultAction"], json!("allow"));
    assert_eq!(body["rules"][0]["id"], json!("it-block"));
    assert_eq!(body["rules"][0]["note"], json!("Bloqué pour le test"));
    assert!(
        body["purposes"]
            .as_array()
            .unwrap()
            .contains(&json!({ "caller": "core", "purpose": "metadata" }))
    );
}

#[tokio::test]
async fn invalid_rules_are_refused_with_a_code_and_change_nothing() {
    let t = test_app();
    let bad_host = json!({
        "defaultAction": "block",
        "rules": [{ "id": "r", "host": "not a host", "action": "block" }]
    });

    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&t.token),
        Some(bad_host),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], json!("invalid_host"));
    let (_, stored) = get(&t.app, "/api/admin/network/rules", Some(&t.token)).await;
    assert_eq!(stored["defaultAction"], json!("allow"));
    assert_eq!(stored["rules"], json!([]));
}

#[tokio::test]
async fn a_body_that_is_not_a_rules_document_is_refused() {
    let t = test_app();

    let (status, body) = send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&t.token),
        Some(json!({ "defaultAction": "sometimes", "rules": [] })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], json!("invalid_body"));
}

#[tokio::test]
async fn a_rules_body_past_the_size_bound_is_refused_unread() {
    let t = test_app();
    let huge = json!({ "defaultAction": "allow", "rules": [], "pad": "x".repeat(70_000) });

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&t.token),
        Some(huge),
    )
    .await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn a_core_call_the_rules_block_shows_up_in_the_journal_and_the_summary() {
    let t = test_app();
    t.state.network.install().unwrap();
    send(
        &t.app,
        "PUT",
        "/api/admin/network/rules",
        Some(&t.token),
        Some(rules_blocking("it-network-blocked")),
    )
    .await;

    let refused = tokio::task::spawn_blocking(|| {
        kroma_http::Fetch::new()
            .purpose("it-network-blocked")
            .get("https://tracker.example/announce?passkey=s3cret")
    })
    .await
    .unwrap();

    let error = refused.unwrap_err().to_string();
    assert!(error.contains(kroma_http::egress::BLOCKED), "{error}");
    let uri = "/api/admin/network/flows?verdict=blocked&purpose=it-network-blocked";
    let (status, body) = get(&t.app, uri, Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let flow = &body["flows"][0];
    assert!(flow["id"].is_u64(), "{flow}");
    assert_eq!(flow["caller"], json!("core"));
    assert_eq!(flow["host"], json!("tracker.example"));
    assert_eq!(flow["port"], json!(443));
    assert_eq!(flow["route"], json!("blocked"));
    assert_eq!(flow["rule"], json!("it-block"));
    assert!(!flow.to_string().contains("s3cret"));
    let (_, summary) = get(&t.app, "/api/admin/network/summary?days=1", Some(&t.token)).await;
    assert!(summary["totals"]["blocked"].as_i64().unwrap() >= 1);
    assert!(
        summary["rows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["purpose"] == json!("it-network-blocked")
                && row["verdict"] == json!("blocked"))
    );
}

fn phone_on_the_tunnel() -> [(&'static str, &'static str); 4] {
    [
        ("x-forwarded-for", "203.0.113.9"),
        ("cf-connecting-ip", "203.0.113.9"),
        ("cf-ray", "8f00000000000000-ZRH"),
        ("user-agent", "Kroma/1.0 (iPhone 17 Pro; iOS 26.0)"),
    ]
}

#[tokio::test]
async fn a_client_on_the_tunnel_is_tallied_with_its_address_and_device() {
    let t = test_app();

    raw(&t.app, "GET", "/api/health", None, None, &phone_on_the_tunnel()).await;

    let (status, body) = get(&t.app, "/api/admin/network/inbound?days=1", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let row = &body["rows"][0];
    assert_eq!(row["address"], json!("203.0.113.9"));
    assert_eq!(row["via"], json!("tunnel"));
    assert_eq!(row["userAgent"], json!("Kroma/1.0 (iPhone 17 Pro; iOS 26.0)"));
    assert_eq!(row["count"], json!(1));
    assert!(row["bytesOut"].as_i64().unwrap() > 0, "{row}");
}

#[tokio::test]
async fn this_machine_talking_to_itself_is_not_a_client() {
    let t = test_app();

    get(&t.app, "/api/health", None).await;

    let (_, body) = get(&t.app, "/api/admin/network/inbound?days=1", Some(&t.token)).await;
    assert_eq!(body["totals"]["requests"], json!(0));
}

#[tokio::test]
async fn a_cf_ray_from_an_untrusted_peer_says_nothing_about_a_tunnel() {
    let t = test_app();
    let mut req = axum::http::Request::builder()
        .uri("/api/health")
        .header("cf-ray", "forged")
        .body(axum::body::Body::empty())
        .unwrap();
    req.extensions_mut()
        .insert(axum::extract::ConnectInfo(std::net::SocketAddr::from((
            [192, 168, 1, 20],
            40000,
        ))));

    tower::ServiceExt::oneshot(t.app.clone(), req).await.unwrap();

    let (_, body) = get(&t.app, "/api/admin/network/inbound?days=1", Some(&t.token)).await;
    assert_eq!(body["rows"][0]["via"], json!("lan"));
}

#[tokio::test]
async fn the_flows_route_pages_through_the_journal_and_counts_every_match() {
    let t = test_app();
    for n in 0..3 {
        t.state.network.record(
            "core",
            crate::services::network::FlowReport {
                purpose: "it-network-paged".to_string(),
                method: "GET".to_string(),
                host: format!("host-{n}.example"),
                port: 443,
                route: crate::services::network::FlowRoute::Direct,
                status: Some(200),
                bytes_in: 0,
                bytes_out: 0,
                duration_ms: 0,
                error: None,
                rule: None,
            },
        );
    }

    let uri = "/api/admin/network/flows?purpose=it-network-paged&limit=1&offset=1";
    let (status, body) = get(&t.app, uri, Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["total"], json!(3));
    assert_eq!(body["flows"].as_array().unwrap().len(), 1);
    assert_eq!(body["flows"][0]["host"], json!("host-1.example"));
}

#[tokio::test]
async fn the_listeners_name_the_cores_own_socket_and_its_exposure() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/admin/network/listeners", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["listeners"][0],
        json!({
            "owner": "core", "protocol": "tcp", "address": "127.0.0.1", "port": 0,
            "purpose": "web", "exposure": "loopback"
        })
    );
}

#[cfg(unix)]
#[tokio::test]
async fn the_socket_modules_call_back_on_is_listed_as_this_machine_only() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/admin/network/listeners", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert!(
        body["listeners"].as_array().unwrap().contains(&json!({
            "owner": "core", "protocol": "unix",
            "address": t.supervisor.host_socket().display().to_string(),
            "purpose": "seam", "exposure": "loopback"
        })),
        "{body}"
    );
}
