use anyhow::Result;
use kroma_module_sdk::http::Fetch;
use serde_json::Value;

use crate::dialect::Method;

pub(crate) const PURPOSE: &str = "import";
const MAX_TIME_SECS: u32 = 25;

pub(crate) type Query = Vec<(&'static str, String)>;

// No `Debug`: `authorization` holds the token and `body` the password.
pub(crate) struct Request {
    pub(crate) method: Method,
    pub(crate) url: String,
    pub(crate) query: Query,
    pub(crate) authorization: Option<String>,
    pub(crate) body: Option<Value>,
    pub(crate) max_bytes: u64,
}

pub(crate) struct Answer {
    pub(crate) status: u16,
    pub(crate) location: Option<String>,
    pub(crate) body: Vec<u8>,
}

pub(crate) trait Web: Send + Sync {
    fn send(&self, request: &Request) -> Result<Answer>;
}

pub(crate) struct Live;

impl Web for Live {
    fn send(&self, request: &Request) -> Result<Answer> {
        let mut fetch = Fetch::new()
            .purpose(PURPOSE)
            // The password and the token go to the address the owner gave and
            // to no place that address points at.
            .no_redirects()
            .max_time(MAX_TIME_SECS)
            .max_bytes(request.max_bytes);
        if let Some(authorization) = &request.authorization {
            fetch = fetch.header("Authorization", authorization.clone());
        }
        for (name, value) in &request.query {
            fetch = fetch.query(name, value.clone());
        }
        let response = match request.method {
            Method::Get => fetch.get(&request.url)?,
            Method::Post => {
                fetch.post_json(&request.url, request.body.as_ref().unwrap_or(&Value::Null))?
            }
        };
        Ok(Answer {
            status: response.status,
            location: response.header("location").map(str::to_string),
            body: response.body,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::mpsc::{channel, Receiver};

    use kroma_module_sdk::primitives::random_token;
    use serde_json::json;

    use super::*;

    struct Listening {
        address: String,
        heard: Receiver<String>,
    }

    fn heard_on(stream: &mut TcpStream) -> String {
        let mut request = Vec::new();
        let mut chunk = [0; 4096];
        loop {
            let read = stream.read(&mut chunk).unwrap_or(0);
            request.extend_from_slice(&chunk[..read]);
            let text = String::from_utf8_lossy(&request).to_string();
            let Some((head, body)) = text.split_once("\r\n\r\n") else {
                continue;
            };
            let expected = head
                .lines()
                .filter_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")?
                        .trim()
                        .parse()
                        .ok()
                })
                .next()
                .unwrap_or(0);
            if read == 0 || body.len() >= expected {
                return text;
            }
        }
    }

    fn answering(response: &'static str) -> Listening {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let (tell, heard) = channel();
        std::thread::spawn(move || {
            for mut stream in listener.incoming().flatten() {
                let _ = tell.send(heard_on(&mut stream));
                let _ = stream.write_all(response.as_bytes());
            }
        });
        Listening { address, heard }
    }

    fn get(address: &str, authorization: Option<String>) -> Request {
        Request {
            method: Method::Get,
            url: format!("{address}/Items"),
            query: vec![("includeItemTypes", "Movie,Episode".to_string())],
            authorization,
            body: None,
            max_bytes: 1024,
        }
    }

    const FOUND: &str = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 12\r\nConnection: close\r\n\r\n{\"Items\":[]}";
    const MOVED: &str = "HTTP/1.1 302 Found\r\nLocation: /elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    fn a_call_carries_the_token_in_the_authorization_header_and_in_no_legacy_place() {
        let server = answering(FOUND);
        let token = random_token();
        let header = format!("MediaBrowser Client=\"KROMA\", Token=\"{token}\"");

        let answer = Live.send(&get(&server.address, Some(header))).unwrap();

        let sent = server.heard.recv().unwrap().to_ascii_lowercase();
        let legacy = [
            "x-emby-token",
            "x-emby-authorization",
            "x-mediabrowser-token",
            "api_key",
            "apikey",
        ];
        assert_eq!(
            (answer.status, answer.body.as_slice()),
            (200, &b"{\"Items\":[]}"[..])
        );
        assert!(sent.contains(&format!(
            "authorization: mediabrowser client=\"kroma\", token=\"{token}\""
        )));
        assert!(legacy.iter().all(|place| !sent.contains(place)));
    }

    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    fn a_read_is_a_get_with_its_query_in_the_address() {
        let server = answering(FOUND);

        Live.send(&get(&server.address, None)).unwrap();

        let sent = server.heard.recv().unwrap().to_ascii_lowercase();
        let line = sent.lines().next().unwrap();
        assert!(line.starts_with("get /items?includeitemtypes=movie"));
        assert!(line.contains("episode"));
        assert!(!sent.contains("authorization:"));
    }

    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    fn the_sign_in_is_a_post_of_json() {
        let server = answering(FOUND);
        let typed = random_token();
        let request = Request {
            method: Method::Post,
            body: Some(json!({ "Username": "sam", "Pw": typed })),
            query: Vec::new(),
            ..get(&server.address, None)
        };

        Live.send(&request).unwrap();

        let sent = server.heard.recv().unwrap();
        assert!(sent.starts_with("POST /Items HTTP/1.1"));
        assert!(sent
            .to_ascii_lowercase()
            .contains("content-type: application/json"));
        assert!(sent.contains(&format!("\"Pw\":\"{typed}\"")));
    }

    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    fn a_redirect_comes_back_with_where_it_points_and_is_not_followed() {
        let server = answering(MOVED);

        let answer = Live.send(&get(&server.address, None)).unwrap();

        let calls = [
            server.heard.try_recv().is_ok(),
            server.heard.try_recv().is_ok(),
        ];
        assert_eq!(
            (answer.status, answer.location.as_deref()),
            (302, Some("/elsewhere"))
        );
        assert_eq!(calls, [true, false]);
    }

    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "binds a test server, and a component holds no socket"
    )]
    fn an_answer_past_its_bound_is_not_handed_back() {
        let server = answering(FOUND);
        let small = Request {
            max_bytes: 4,
            ..get(&server.address, None)
        };

        let answer = Live.send(&small);

        assert!(answer.is_err());
    }
}
