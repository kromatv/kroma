#![cfg(unix)]

use std::path::Path;
use std::sync::OnceLock;
use std::sync::atomic::Ordering;

use kroma_http::Loopback;
use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::build;
use component_support::{Server, http_server};

const TRANSMISSION: &str = "tv.kroma.engine.transmission";

fn transmission_component() -> &'static [u8] {
    static BUILT: OnceLock<Vec<u8>> = OnceLock::new();
    BUILT.get_or_init(|| {
        build(
            &Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../../modules/tv.kroma.engine.transmission/server"),
            "kroma-module-transmission",
        )
    })
}

#[test]
fn the_real_transmission_module_runs_as_a_component() {
    let server = Server::new("component-transmission", NetworkAction::Direct);
    let endpoint = server.started(
        TRANSMISSION,
        transmission_component(),
        r#", "permissions": { "net": { "connect": [{ "purpose": "download-client", "to": ["public", "lan"] }] } }"#,
    );
    let (port, hits) = http_server(r#"{"result":"success","arguments":{"version":"4.0-stub"}}"#);
    let body = serde_json::json!({ "client": { "url": format!("http://127.0.0.1:{port}") } });

    let refused = Loopback::new()
        .post_json(&endpoint.url("/_port/tv.kroma.torrents/client/test"), &body)
        .unwrap();
    let answered = server
        .as_the_core(TRANSMISSION)
        .post_json(&endpoint.url("/_port/tv.kroma.torrents/client/test"), &body)
        .unwrap();

    assert_eq!(refused.status, 401, "a port call needs the port token");
    assert!(answered.text().contains("4.0-stub"), "{}", answered.text());
    assert!(hits.load(Ordering::SeqCst) >= 1);
    assert_eq!(
        server.network.flows.lock().unwrap()[0].purpose,
        "download-client"
    );
    let _ = &server.runtime;
}
