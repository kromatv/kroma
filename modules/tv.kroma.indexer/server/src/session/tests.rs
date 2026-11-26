use super::*;

#[test]
fn jar_path_is_sanitized_and_stable() {
    let dir = Path::new("/data");
    let a = cookie_jar_path(dir, "torrent-leech");
    assert_eq!(a, cookie_jar_path(dir, "torrent-leech"));
    assert_eq!(a, Path::new("/data/indexers/torrent_leech.cookies"));
}

#[test]
fn flaresolverr_request_shape() {
    let body = flaresolverr_body("request.get", "https://x.to/s?q=a", None);
    assert_eq!(body["cmd"], "request.get");
    assert_eq!(body["url"], "https://x.to/s?q=a");
    assert_eq!(body["maxTimeout"], 60000);
    assert!(body.get("postData").is_none());
    let post = flaresolverr_body("request.post", "https://x.to/login", Some("u=a&p=b".into()));
    assert_eq!(post["postData"], "u=a&p=b");
}

#[test]
fn append_query_and_form_encode() {
    let q = vec![
        ("q".to_string(), "the matrix".to_string()),
        ("cat".to_string(), "1,2".to_string()),
    ];
    assert_eq!(
        append_query("https://x/a", &q),
        "https://x/a?q=the%20matrix&cat=1%2C2"
    );
    assert_eq!(
        append_query("https://x/a?p=1", &q),
        "https://x/a?p=1&q=the%20matrix&cat=1%2C2"
    );
    assert_eq!(append_query("https://x/a", &[]), "https://x/a");
}

fn flaresolverr_answering(page: &'static str) -> String {
    use std::io::{BufRead as _, BufReader, Read as _, Write as _};

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut length = 0usize;
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = v.trim().parse().unwrap_or(0);
                }
            }
            let mut request = vec![0u8; length];
            let _ = reader.read_exact(&mut request);
            let body = serde_json::json!({ "status": "ok", "solution": { "status": 200, "response": page } })
                .to_string();
            let reply = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(reply.as_bytes());
        }
    });
    format!("http://127.0.0.1:{port}")
}

fn json_tracker_behind(solver: String, tag: &str) -> (Session, kroma_module_sdk::testing::TempDir) {
    let def = crate::definition::parse(include_bytes!("../../tests/fixtures/synthetic-json.yml"))
        .unwrap();
    let dir = kroma_module_sdk::testing::temp_dir(tag);
    let cfg = IndexerConfig {
        base_url: "https://json.example/".into(),
        settings: Default::default(),
    };
    let pool = kroma_module_sdk::db::testing::temp_pool(tag);
    kroma_module_sdk::db::apply_migrations(&pool.get().unwrap(), crate::db::MIGRATIONS).unwrap();
    let session = Session::new(
        (*pool).clone(),
        dir.path(),
        "json",
        def,
        cfg,
        None,
        Some(solver),
    );
    (session, dir)
}

#[test]
#[cfg_attr(
    target_family = "wasm",
    ignore = "binds a test server, and a component holds no socket"
)]
fn a_json_search_through_flaresolverr_reads_the_document_the_browser_rendered() {
    let page = r#"<html><head><meta charset="utf-8"></head><body><pre>{"total":1,"results":[{"id":7,"name":"Dune Part Two 2024 2160p","category_id":100,"info_hash":"abc123","size_bytes":34359738368,"seeders":5,"leechers":0}]}</pre><div class="json-formatter-container"></div></body></html>"#;
    let (session, _dir) = json_tracker_behind(flaresolverr_answering(page), "idx-fs-json");

    let out = session.search(
        &crate::Query::Text {
            query: "dune".into(),
        },
        &[2000],
    );

    assert!(out.errors.is_empty(), "{:?}", out.errors);
    assert_eq!(out.releases.len(), 1);
    assert_eq!(out.releases[0].title, "Dune Part Two 2024 2160p");
}

#[test]
#[cfg_attr(
    target_family = "wasm",
    ignore = "binds a test server, and a component holds no socket"
)]
fn a_challenge_page_through_flaresolverr_is_still_a_refusal() {
    let page = "<html><body><h1>Just a moment...</h1></body></html>";
    let (session, _dir) = json_tracker_behind(flaresolverr_answering(page), "idx-fs-challenge");

    let out = session.search(
        &crate::Query::Text {
            query: "dune".into(),
        },
        &[2000],
    );

    assert!(out.releases.is_empty());
    assert!(
        out.errors.iter().any(|e| e.contains("did not answer json")),
        "{:?}",
        out.errors
    );
}
