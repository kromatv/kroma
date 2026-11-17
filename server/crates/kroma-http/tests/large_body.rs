mod support;

use kroma_http::Fetch;
use support::{one_shot_server, text};

fn longer_than_any_curl_config_line() -> serde_json::Value {
    serde_json::json!({ "catalog": "\"a\"".repeat(4 << 20) })
}

#[test]
fn a_json_post_longer_than_any_curl_config_line_reaches_the_server_whole() {
    let body = longer_than_any_curl_config_line();
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "{}");

    let resp = Fetch::new().post_json(&url, &body).unwrap();

    let request = server.join().unwrap();
    assert_eq!(resp.status, 200);
    assert!(request.ends_with(body.to_string().as_bytes()));
}

#[test]
fn a_json_put_longer_than_any_curl_config_line_reaches_the_server_whole() {
    let body = longer_than_any_curl_config_line();
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "{}");

    let resp = Fetch::new().put_json(&url, &body).unwrap();

    let request = server.join().unwrap();
    assert_eq!(resp.status, 200);
    assert!(text(&request).starts_with("PUT "));
    assert!(request.ends_with(body.to_string().as_bytes()));
}
