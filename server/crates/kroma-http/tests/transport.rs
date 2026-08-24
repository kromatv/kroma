use kroma_http::Fetch;

fn read_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
    use std::io::Read;
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).unwrap_or(0) == 0 {
            break;
        }
        head.push(byte[0]);
    }
    let length = String::from_utf8_lossy(&head)
        .lines()
        .find_map(|l| {
            l.split_once(':')
                .filter(|(k, _)| k.eq_ignore_ascii_case("content-length"))
        })
        .and_then(|(_, v)| v.trim().parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; length];
    if length > 0 {
        stream.read_exact(&mut body).unwrap();
    }
    head.extend_from_slice(&body);
    head
}

fn text(request: &[u8]) -> String {
    String::from_utf8_lossy(request).into_owned()
}

fn one_shot_server(status_line: &str, body: &str) -> (String, std::thread::JoinHandle<Vec<u8>>) {
    use std::io::Write;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    let response = format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
        body.len()
    );
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
        request
    });
    (url, handle)
}

#[test]
fn post_bytes_round_trips_arbitrary_binary() {
    let body: Vec<u8> = (0u8..=255).collect();
    let (url, server) = one_shot_server("HTTP/1.1 201 Created", "");

    let resp = Fetch::new()
        .post_bytes(&url, "application/octet-stream", &body)
        .unwrap();

    let request = server.join().unwrap();
    assert!(
        request.ends_with(&body),
        "every byte value must survive the transfer"
    );
    assert_eq!(resp.status, 201);
}

#[test]
fn a_get_carries_its_headers_and_url_encodes_its_query() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", r#"{"ok":true}"#);
    let resp = Fetch::new()
        .header("X-Api-Key", "secret")
        .query("q", "the matrix")
        .query("cat", "2000&2010")
        .get(&url)
        .unwrap();

    let request = text(&server.join().unwrap());
    assert!(request.starts_with("GET /?"), "{request}");
    assert!(request.contains("q=the+matrix"), "{request}");
    assert!(
        request.contains("cat=2000%262010"),
        "a reserved char must be escaped: {request}"
    );
    assert!(request.contains("X-Api-Key: secret"), "{request}");
    assert_eq!(resp.status, 200);
    assert_eq!(resp.header("content-type"), Some("application/json"));
    assert_eq!(resp.text(), r#"{"ok":true}"#);
}

#[test]
fn a_get_without_query_parameters_sends_a_bare_path() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "hi");
    let resp = Fetch::new().get(&url).unwrap();
    let request = text(&server.join().unwrap());
    assert!(request.starts_with("GET / HTTP/"), "{request}");
    assert_eq!(resp.text(), "hi");
}

#[test]
fn get_json_deserializes_a_2xx_body() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", r#"{"version":"4.6.7"}"#);
    #[derive(serde::Deserialize)]
    struct Version {
        version: String,
    }
    let parsed: Version = Fetch::new().get_json(&url).unwrap();
    server.join().unwrap();
    assert_eq!(parsed.version, "4.6.7");
}

#[test]
fn get_json_surfaces_the_status_and_body_of_a_non_2xx() {
    let (url, server) = one_shot_server("HTTP/1.1 403 Forbidden", "wrong api key");
    let err = Fetch::new()
        .get_json::<serde_json::Value>(&url)
        .unwrap_err()
        .to_string();
    server.join().unwrap();
    assert!(err.contains("403"), "{err}");
    assert!(err.contains("wrong api key"), "{err}");
}

#[test]
fn a_form_post_url_encodes_every_field() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "Ok.");
    let resp = Fetch::new()
        .post_form(&url, &[("username", "admin"), ("password", "p&ss word")])
        .unwrap();

    let request = text(&server.join().unwrap());
    assert!(request.starts_with("POST / HTTP/"), "{request}");
    assert!(request
        .to_lowercase()
        .contains("content-type: application/x-www-form-urlencoded"));
    assert!(
        request.ends_with("username=admin&password=p%26ss+word"),
        "{request}"
    );
    assert_eq!(resp.text(), "Ok.");
}

#[test]
fn a_json_post_sends_the_serialized_body() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "{}");
    Fetch::new()
        .post_json(&url, &serde_json::json!({ "method": "torrent-get" }))
        .unwrap();
    let request = text(&server.join().unwrap());
    assert!(
        request
            .to_lowercase()
            .contains("content-type: application/json"),
        "{request}"
    );
    assert!(
        request.ends_with(r#"{"method":"torrent-get"}"#),
        "{request}"
    );
}

#[test]
fn a_form_field_cannot_inject_a_second_curl_option() {
    let dir = kroma_testing::temp_dir("http-inject");
    let stolen = dir.path().join("stolen.txt");
    let password = format!("p\"\noutput = \"{}", stolen.display());
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "Ok.");

    let resp = Fetch::new()
        .post_form(&url, &[("password", &password)])
        .unwrap();

    let request = text(&server.join().unwrap());
    assert!(
        !stolen.exists(),
        "an injected --output would have written this file"
    );
    assert!(
        request.contains("password=p%22%0Aoutput+%3D+%22"),
        "{request}"
    );
    assert_eq!(resp.text(), "Ok.");
}

#[test]
fn a_header_value_reaches_the_server_with_its_quotes_and_backslashes() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "ok");
    Fetch::new()
        .header("X-Api-Key", r#"se"cr\et"#)
        .get(&url)
        .unwrap();
    let request = text(&server.join().unwrap());
    assert!(request.contains("X-Api-Key: se\"cr\\et"), "{request}");
}

#[test]
fn a_header_value_carrying_crlf_cannot_split_the_request() {
    let (url, server) = one_shot_server("HTTP/1.1 200 OK", "ok");
    Fetch::new()
        .header("X-Api-Key", "k\r\nX-Injected: 1")
        .get(&url)
        .unwrap();
    let request = text(&server.join().unwrap());
    assert!(!request.contains("\r\nX-Injected"), "{request}");
    assert!(request.contains("X-Api-Key: kX-Injected: 1"), "{request}");
}

#[test]
fn post_bytes_sends_the_declared_content_type_and_body() {
    let (url, server) = one_shot_server("HTTP/1.1 201 Created", "");
    let resp = Fetch::new()
        .post_bytes(&url, "application/octet-stream", b"\x00\x01binary")
        .unwrap();
    let request = text(&server.join().unwrap());
    assert!(
        request
            .to_lowercase()
            .contains("content-type: application/octet-stream"),
        "{request}"
    );
    assert!(request.ends_with("\u{0}\u{1}binary"), "{request}");
    assert_eq!(resp.status, 201);
}

#[test]
fn a_refused_connection_reports_the_curl_exit_code() {
    let err = Fetch::new()
        .max_time(5)
        .get("http://127.0.0.1:1/")
        .unwrap_err()
        .to_string();
    assert!(err.contains("curl exit"), "{err}");
}
