// A module with no port routes boots on an EMPTY extra router, which is the
// `serve_one` shape: axum panics if a layer is applied to it bare, and that
// panic took tv.kroma.remote down at spawn.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

fn free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    listener.local_addr().expect("addr").port()
}

fn get(port: u16, path: &str) -> Option<String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream
        .write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").as_bytes())
        .ok()?;
    let mut out = String::new();
    stream.read_to_string(&mut out).ok()?;
    out.lines().next().map(str::to_string)
}

#[test]
fn boots_with_no_modules_and_no_port_routes() {
    let dir = std::path::PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("boot-test");
    std::fs::create_dir_all(&dir).expect("tmp dir");
    let port = free_port();
    std::env::set_var("KROMA_MODULE_ID", "tv.kroma.boot-test");
    std::env::set_var("KROMA_MODULE_PORT", port.to_string());
    std::env::set_var("KROMA_CORE_URL", "http://127.0.0.1:9");
    std::env::set_var("KROMA_HOST_TOKEN", "boot-test-token");
    std::env::set_var("KROMA_DB_PATH", dir.join("boot.db").display().to_string());
    std::env::set_var("KROMA_DATA_DIR", dir.display().to_string());

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        rt.block_on(kroma_module_runtime::serve(|_| {}, vec![], axum::Router::new()))
            .expect("serve");
    });

    let deadline = Instant::now() + Duration::from_secs(10);
    let health = loop {
        if let Some(status) = get(port, "/_health") {
            break status;
        }
        assert!(Instant::now() < deadline, "module never came up");
        std::thread::sleep(Duration::from_millis(50));
    };
    assert!(health.contains("200"), "healthz said: {health}");

    let guarded = get(port, "/_port/_ready").expect("guarded route answers");
    assert!(guarded.contains("401"), "the anchor route must stay behind the host token: {guarded}");
}
