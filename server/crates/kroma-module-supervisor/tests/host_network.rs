use axum::http::StatusCode;
use kroma_module_host::{NetworkAnswer, NetworkFlow, NetworkRoute};
use serde_json::json;

mod test_support;

use test_support::{FABRIC, Modules};

fn flow(host: &str) -> NetworkFlow {
    NetworkFlow {
        purpose: "indexer".into(),
        method: "GET".into(),
        host: host.into(),
        port: 443,
        route: NetworkRoute::Direct,
        status: Some(200),
        bytes_in: 10,
        bytes_out: 0,
        duration_ms: 5,
        error: None,
        rule: None,
    }
}

fn ask_body() -> String {
    json!({ "purpose": "indexer", "method": "GET", "host": "tracker.example", "port": 443 })
        .to_string()
}

#[tokio::test]
async fn a_ruling_is_asked_for_the_module_the_token_names() {
    let modules = Modules::new("network-decide").declaring("tv.kroma.indexer", None);
    let token = modules.token("tv.kroma.indexer");

    let (status, body) = modules
        .post("/_host/network/decide", Some(&token), ask_body())
        .await;

    assert_eq!(status, StatusCode::OK);
    let answer: NetworkAnswer = serde_json::from_str(&body).unwrap();
    assert_eq!(answer.rule.as_deref(), Some("stub"));
    let asked = modules.network.asked.lock().unwrap();
    assert_eq!(asked[0].0, "tv.kroma.indexer");
    assert_eq!(asked[0].1.host, "tracker.example");
}

#[tokio::test]
async fn the_fabric_token_gets_no_ruling_and_files_no_flow() {
    let modules = Modules::new("network-unnamed");
    let flows = serde_json::to_string(&[flow("a.example")]).unwrap();

    let (decided, _) = modules
        .post("/_host/network/decide", Some(FABRIC), ask_body())
        .await;
    let (filed, _) = modules
        .post("/_host/network/flows", Some(FABRIC), flows)
        .await;

    assert_eq!(decided, StatusCode::FORBIDDEN);
    assert_eq!(filed, StatusCode::FORBIDDEN);
    assert!(modules.network.asked.lock().unwrap().is_empty());
    assert!(modules.network.flows.lock().unwrap().is_empty());
}

#[tokio::test]
async fn an_ask_without_a_host_is_refused() {
    let modules = Modules::new("network-malformed").declaring("tv.kroma.indexer", None);
    let token = modules.token("tv.kroma.indexer");
    let body = json!({ "purpose": "indexer", "method": "GET", "host": "", "port": 443 });

    let (status, _) = modules
        .post("/_host/network/decide", Some(&token), body.to_string())
        .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn reported_flows_are_filed_under_the_module_the_token_names() {
    let modules = Modules::new("network-flows").declaring("tv.kroma.torznab", None);
    let token = modules.token("tv.kroma.torznab");
    let flows = serde_json::to_string(&[flow("a.example"), flow("b.example")]).unwrap();

    let (status, _) = modules
        .post("/_host/network/flows", Some(&token), flows)
        .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let filed = modules.network.flows.lock().unwrap();
    let hosts: Vec<(&str, &str)> = filed
        .iter()
        .map(|(caller, flow)| (caller.as_str(), flow.host.as_str()))
        .collect();
    assert_eq!(
        hosts,
        [
            ("tv.kroma.torznab", "a.example"),
            ("tv.kroma.torznab", "b.example")
        ]
    );
}

#[tokio::test]
async fn a_report_past_the_batch_cap_is_refused_whole() {
    let modules = Modules::new("network-batch").declaring("tv.kroma.torznab", None);
    let token = modules.token("tv.kroma.torznab");
    let flows = serde_json::to_string(&vec![flow("a.example"); 201]).unwrap();

    let (status, _) = modules
        .post("/_host/network/flows", Some(&token), flows)
        .await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(modules.network.flows.lock().unwrap().is_empty());
}
