use std::io::{Read, Write};
use std::net::TcpListener;

use kroma_http::Loopback;

fn one_shot_server(status_line: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    let response = format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 16384];
        let read = stream.read(&mut buf).unwrap_or(0);
        stream.write_all(response.as_bytes()).unwrap();
        stream.flush().unwrap();
        String::from_utf8_lossy(&buf[..read]).into_owned()
    });
    (url, handle)
}

#[test]
fn a_post_round_trips_status_headers_and_body() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", r#"{"ok":true}"#);

    let resp = Loopback::new()
        .header("authorization", "Bearer tok")
        .post_json(&url, &serde_json::json!({ "query": "test" }))
        .unwrap();

    let request = server.join().unwrap();
    assert!(request.starts_with("POST / HTTP/"), "{request}");
    assert!(request.to_lowercase().contains("authorization: bearer tok"));
    assert!(
        request.to_lowercase().contains("content-type: application/json"),
        "{request}"
    );
    assert!(request.ends_with(r#"{"query":"test"}"#), "{request}");
    assert_eq!(resp.status, 200);
    assert_eq!(resp.header("content-type"), Some("application/json"));
    assert_eq!(resp.text(), r#"{"ok":true}"#);
}

#[test]
fn a_get_carries_its_query_to_the_peer() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "hi");

    let resp = Loopback::new()
        .query("key", "a b")
        .query("kind", "str")
        .get(&url)
        .unwrap();

    let request = server.join().unwrap();
    assert!(request.starts_with("GET /?key=a+b&kind=str HTTP/"), "{request}");
    assert_eq!(resp.text(), "hi");
}

#[test]
fn post_bytes_round_trips_arbitrary_binary() {
    let body: Vec<u8> = (0u8..=255).collect();
    let (url, server) = one_shot_server("HTTP/1.1 201 Created", "");

    let resp = Loopback::new()
        .post_bytes(&url, "application/octet-stream", &body)
        .unwrap();

    server.join().unwrap();
    assert_eq!(resp.status, 201);
}

#[test]
fn get_json_surfaces_the_status_and_body_of_a_non_2xx() {
    let (url, server) = one_shot_server("HTTP/1.1 403 Forbidden", "bad host token");

    let err = Loopback::new()
        .get_json::<serde_json::Value>(&url)
        .unwrap_err()
        .to_string();

    server.join().unwrap();
    assert!(err.contains("403"), "{err}");
    assert!(err.contains("bad host token"), "{err}");
}

#[test]
fn a_refused_connection_is_an_error_rather_than_a_panic() {
    let err = Loopback::new()
        .max_time(5)
        .get("http://127.0.0.1:1/_port/x")
        .unwrap_err()
        .to_string();
    assert!(!err.is_empty());
}

#[test]
fn a_peer_that_is_not_on_this_machine_is_refused_before_any_connection() {
    let err = Loopback::new()
        .post_json("http://example.com/_port/x", &serde_json::json!({}))
        .unwrap_err()
        .to_string();
    assert!(err.contains("example.com"), "{err}");
}
