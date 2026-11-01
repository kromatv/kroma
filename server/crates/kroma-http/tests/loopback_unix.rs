#![cfg(unix)]

use std::io::{Read, Write};
use std::os::unix::net::UnixListener;
use std::path::Path;
use std::time::{Duration, Instant};

use kroma_http::loopback::unix_url;
use kroma_http::Loopback;

fn one_shot_server(
    socket: &Path,
    status_line: &str,
    body: &str,
) -> std::thread::JoinHandle<String> {
    let listener = UnixListener::bind(socket).unwrap();
    let response = format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 16384];
        let read = stream.read(&mut buf).unwrap_or(0);
        stream.write_all(response.as_bytes()).unwrap();
        stream.flush().unwrap();
        String::from_utf8_lossy(&buf[..read]).into_owned()
    })
}

#[test]
fn a_post_round_trips_over_a_unix_socket() {
    let dir = kroma_testing::temp_dir("unix-post");
    let socket = dir.path().join("module.sock");
    let server = one_shot_server(&socket, "HTTP/1.1 200 OK", r#"{"ok":true}"#);

    let resp = Loopback::new()
        .header("authorization", "Bearer tok")
        .query("fresh", "1")
        .post_json(
            &format!("{}/_port/vpn/proxy", unix_url(&socket)),
            &serde_json::json!({ "query": "test" }),
        )
        .unwrap();

    let request = server.join().unwrap();
    assert!(
        request.starts_with("POST /_port/vpn/proxy?fresh=1 HTTP/1.1"),
        "{request}"
    );
    let lower = request.to_lowercase();
    assert!(lower.contains("host: localhost"), "{request}");
    assert!(lower.contains("authorization: bearer tok"), "{request}");
    assert!(request.ends_with(r#"{"query":"test"}"#), "{request}");
    assert_eq!(resp.status, 200);
    assert_eq!(resp.text(), r#"{"ok":true}"#);
}

#[test]
fn a_socket_nobody_listens_on_is_an_error_naming_it() {
    let dir = kroma_testing::temp_dir("unix-absent");
    let socket = dir.path().join("gone.sock");

    let err = Loopback::new()
        .max_time(5)
        .get(&format!("{}/_health", unix_url(&socket)))
        .unwrap_err();

    assert!(format!("{err:#}").contains("gone.sock"), "{err:#}");
}

#[test]
fn a_peer_that_stalls_after_its_head_costs_only_the_budget() {
    let dir = kroma_testing::temp_dir("unix-stall");
    let socket = dir.path().join("stall.sock");
    let listener = UnixListener::bind(&socket).unwrap();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 16384];
        let _ = stream.read(&mut buf);
        stream
            .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 4096\r\n\r\n")
            .unwrap();
        std::thread::sleep(Duration::from_secs(20));
    });
    let started = Instant::now();

    let err = Loopback::new()
        .max_time(1)
        .get(&format!("{}/_health", unix_url(&socket)))
        .unwrap_err()
        .to_string();

    assert!(err.contains("did not answer in time"), "{err}");
    assert!(started.elapsed() < Duration::from_secs(10));
}
