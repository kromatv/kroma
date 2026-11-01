use std::net::TcpListener;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use kroma_db::testing::{temp_pool, TempPool};
use kroma_engine::point::Point;
use kroma_engine::services::email::send_test;
use kroma_engine::services::network::{
    Flow, FlowFilter, FlowRoute, Network, NetworkRules, CORE, VPN_POINT,
};
use kroma_engine::services::settings::Settings;
use kroma_http::egress::BLOCKED;
use serde_json::json;

const BLOCKED_HOST: &str = "smtp.blocked.test";
const TUNNELLED_HOST: &str = "smtp.tunnelled.test";
const OWNER: &str = "owner@example.test";

fn network() -> &'static Network {
    static NETWORK: OnceLock<Arc<Network>> = OnceLock::new();
    NETWORK.get_or_init(|| {
        let dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join("smtp-egress");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create the policy's database folder");
        let pool = kroma_db::init(&dir.join("kroma.db")).expect("open the policy's database");
        let vpn = Point::stub(VPN_POINT, |_, _| {
            Some(json!("socks5://kroma:pw@127.0.0.1:25345"))
        });
        let network = Arc::new(Network::new(pool.clone(), Settings::load(&pool), vpn));
        let rules: NetworkRules = serde_json::from_value(json!({
            "defaultAction": "allow",
            "rules": [
                { "id": "no-smtp", "host": BLOCKED_HOST, "action": "block" },
                { "id": "tunnel", "host": TUNNELLED_HOST, "action": "vpn" }
            ]
        }))
        .expect("a rules document");
        network.set_rules(rules).expect("store the rules");
        network.install().expect("install the gate");
        network
    })
}

fn mailer(host: &str, port: u16) -> (TempPool, Settings) {
    let pool = temp_pool("smtp-egress");
    let settings = Settings::load(&pool);
    settings.set_patch(
        &pool,
        [
            ("smtpHost", json!(host)),
            ("smtpPort", json!(port)),
            ("smtpFrom", json!("kroma@example.test")),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect(),
    );
    (pool, settings)
}

fn journalled(host: &str, port: u16) -> Flow {
    let filter = FlowFilter {
        limit: 100,
        purpose: Some("email".to_string()),
        ..FlowFilter::default()
    };
    network()
        .flows(&filter)
        .flows
        .into_iter()
        .find(|flow| flow.host == host && flow.port == port)
        .expect("a journal row for the mail")
}

fn closed_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .expect("a free port")
        .port()
}

#[tokio::test]
async fn a_block_rule_on_the_smtp_host_stops_the_mail_before_it_dials() {
    network();
    let (_pool, settings) = mailer(BLOCKED_HOST, 587);

    let error = send_test(&settings, OWNER, "en")
        .await
        .expect_err("a refusal");

    assert!(error.contains(BLOCKED), "{error}");
    let flow = journalled(BLOCKED_HOST, 587);
    assert_eq!(flow.caller, CORE);
    assert_eq!(flow.purpose, "email");
    assert_eq!(flow.method, "SMTP");
    assert_eq!(flow.route, FlowRoute::Blocked);
    assert_eq!(flow.rule.as_deref(), Some("no-smtp"));
    assert_eq!(flow.bytes_out, 0);
}

#[tokio::test]
async fn mail_the_rules_send_through_the_vpn_is_refused_rather_than_sent_direct() {
    network();
    let (_pool, settings) = mailer(TUNNELLED_HOST, 587);

    let error = send_test(&settings, OWNER, "en")
        .await
        .expect_err("a refusal");

    assert!(error.contains("cannot be sent through a proxy"), "{error}");
    let flow = journalled(TUNNELLED_HOST, 587);
    assert_eq!(flow.route, FlowRoute::Blocked);
    assert_eq!(flow.rule.as_deref(), Some("tunnel"));
}

#[tokio::test]
async fn a_test_email_the_rules_let_through_is_journalled_under_email() {
    network();
    let port = closed_port();
    let (_pool, settings) = mailer("127.0.0.1", port);

    let error = send_test(&settings, OWNER, "en")
        .await
        .expect_err("nothing listens on the port");

    let flow = journalled("127.0.0.1", port);
    assert_eq!(flow.caller, CORE);
    assert_eq!(flow.purpose, "email");
    assert_eq!(flow.route, FlowRoute::Direct);
    assert_eq!(flow.rule, None);
    assert!(flow.bytes_out > 0);
    assert_eq!(flow.error.as_deref(), Some(error.as_str()));
}
