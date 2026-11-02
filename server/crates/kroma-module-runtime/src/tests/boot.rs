use std::time::{Duration, Instant};

use axum::Router;
use kroma_http::loopback::unix_url;
use kroma_http::Loopback;

#[test]
fn boots_with_no_modules_and_no_port_routes() {
    let dir = super::scratch("boot");
    let socket = dir.path().join("module.sock");
    let health = || Loopback::new().get(&format!("{}/_health", unix_url(&socket)));

    super::on_a_socket(
        super::env(
            dir.path(),
            "tv.kroma.boot-test",
            &dir.path().join("no-core.sock"),
        ),
        &socket,
        |_| Router::new(),
        vec![],
    );

    let deadline = Instant::now() + Duration::from_secs(10);
    let answered = loop {
        if let Ok(answered) = health() {
            break answered;
        }
        assert!(Instant::now() < deadline, "module never came up");
        std::thread::sleep(Duration::from_millis(50));
    };
    assert_eq!(answered.status, 200);
    let guarded = Loopback::new()
        .get(&format!("{}/_port/_ready", unix_url(&socket)))
        .expect("guarded route answers");
    assert_eq!(
        guarded.status, 401,
        "the anchor route must stay behind the host token"
    );
}

#[test]
fn a_native_build_refuses_to_serve() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");

    let served = rt.block_on(crate::serve(|_| Router::new(), vec![]));

    let refusal = served.unwrap_err().to_string();
    assert!(
        refusal.contains("only as a WebAssembly component"),
        "{refusal}"
    );
}
