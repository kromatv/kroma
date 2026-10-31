mod support;

use std::sync::{Arc, Mutex, OnceLock};

use kroma_http::egress::{self, Decision, Exchange, Outgoing, Route, Ruling, BLOCKED};
use kroma_http::Fetch;
use support::{one_shot_server, text};

fn recorded() -> &'static Mutex<Vec<Exchange>> {
    static RECORDED: OnceLock<Mutex<Vec<Exchange>>> = OnceLock::new();
    RECORDED.get_or_init(|| Mutex::new(Vec::new()))
}

fn rule_for(outgoing: &Outgoing) -> Ruling {
    let (decision, rule) = match outgoing.purpose {
        "test-blocked" => (Decision::Block("the test says no".into()), "r-block"),
        "test-proxied" => (Decision::Proxy("socks5://127.0.0.1:9".into()), "r-vpn"),
        _ => (Decision::Direct, "r-direct"),
    };
    Ruling {
        decision,
        rule: Some(rule.to_string()),
    }
}

fn install_hooks() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        egress::set_gate(Arc::new(rule_for)).unwrap();
        egress::set_sink(Arc::new(|exchange| {
            recorded().lock().unwrap().push(exchange)
        }))
        .unwrap();
    });
}

fn exchange_for(purpose: &str) -> Exchange {
    recorded()
        .lock()
        .unwrap()
        .iter()
        .find(|exchange| exchange.purpose == purpose)
        .cloned()
        .unwrap_or_else(|| panic!("no exchange recorded for {purpose}"))
}

#[test]
fn a_second_gate_is_refused() {
    install_hooks();

    let second = egress::set_gate(Arc::new(|_| Decision::Direct.into()));

    assert!(second.is_err());
}

#[test]
fn a_blocked_call_fails_before_curl_and_is_recorded_without_its_path() {
    install_hooks();

    let err = Fetch::new()
        .purpose("test-blocked")
        .get("https://tracker.example/announce?passkey=s3cret")
        .unwrap_err()
        .to_string();

    assert!(err.contains(BLOCKED), "{err}");
    let exchange = exchange_for("test-blocked");
    assert_eq!(exchange.route, Route::Blocked);
    assert_eq!(
        (exchange.host.as_str(), exchange.port),
        ("tracker.example", 443)
    );
    assert_eq!(exchange.rule.as_deref(), Some("r-block"));
    assert_eq!(exchange.status, None);
    assert!(!exchange.error.unwrap().contains("s3cret"));
}

#[test]
fn a_url_the_gate_cannot_read_is_blocked() {
    install_hooks();

    let err = Fetch::new()
        .purpose("test-userinfo")
        .get("http://user:pw@127.0.0.1:9/")
        .unwrap_err()
        .to_string();

    assert!(err.contains(BLOCKED), "{err}");
    assert_eq!(exchange_for("test-userinfo").route, Route::Blocked);
}

#[test]
fn a_direct_call_is_recorded_with_its_status_and_sizes() {
    install_hooks();
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", r#"{"ok":true}"#);

    let response = Fetch::new()
        .purpose("test-direct")
        .post_json(&url, &serde_json::json!({ "a": 1 }))
        .unwrap();

    server.join().unwrap();
    assert_eq!(response.status, 200);
    let exchange = exchange_for("test-direct");
    assert_eq!(exchange.route, Route::Direct);
    assert_eq!(exchange.method, "POST");
    assert_eq!(exchange.host, "127.0.0.1");
    assert_eq!(exchange.status, Some(200));
    assert_eq!(exchange.bytes_in, 11);
    assert_eq!(exchange.bytes_out, 7);
    assert_eq!(exchange.rule.as_deref(), Some("r-direct"));
    assert_eq!(exchange.error, None);
}

#[test]
fn the_gates_proxy_carries_the_call_instead_of_a_direct_connection() {
    install_hooks();
    let (url, _server) = one_shot_server("HTTP/1.1 200 OK", "direct");

    let outcome = Fetch::new().purpose("test-proxied").max_time(5).get(&url);

    assert!(outcome.is_err());
    let exchange = exchange_for("test-proxied");
    assert_eq!(exchange.route, Route::Proxy);
    assert_eq!(exchange.status, None);
    assert!(exchange.error.is_some());
}

#[test]
fn a_download_lands_in_its_file_and_records_the_file_size() {
    install_hooks();
    let dir = kroma_testing::temp_dir("egress-download");
    let dest = dir.path().join("theme.mp3");
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "ID3-not-really-audio");

    let response = Fetch::new()
        .purpose("test-download")
        .download(&url, &dest)
        .unwrap();

    let request = text(&server.join().unwrap());
    assert!(request.starts_with("GET / "), "{request}");
    assert_eq!(response.status, 200);
    assert!(response.body.is_empty());
    assert_eq!(std::fs::read(&dest).unwrap(), b"ID3-not-really-audio");
    assert_eq!(exchange_for("test-download").bytes_in, 20);
}
