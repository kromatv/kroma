//! A relay on a local port that speaks just enough of the mail relay's
//! protocol for curl, and the app pointed at it.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::{test_app_with_mail_relay, TestApp};

/// A relay that speaks just enough HTTP for curl: it registers anything, mints
/// one activation link, refuses a send until the server is active unless the
/// message is the question, and records every path it was asked.
pub struct StubRelay {
    pub base: String,
    pub calls: Arc<Mutex<Vec<(String, Value)>>>,
    pub active: Arc<AtomicBool>,
}

/// Starts a relay that has activated nobody yet.
pub fn stub_relay() -> StubRelay {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind the stub relay");
    let base = format!("http://{}", listener.local_addr().expect("stub address"));
    let calls = Arc::new(Mutex::new(Vec::new()));
    let active = Arc::new(AtomicBool::new(false));
    let (log, yes, at) = (calls.clone(), active.clone(), base.clone());
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            answer(stream, &at, &log, &yes);
        }
    });
    StubRelay {
        base,
        calls,
        active,
    }
}

fn answer(stream: TcpStream, base: &str, log: &Mutex<Vec<(String, Value)>>, yes: &AtomicBool) {
    let mut reader = BufReader::new(stream.try_clone().expect("clone the stream"));
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return;
    }
    let path = line.split_whitespace().nth(1).unwrap_or("").to_string();
    let (mut length, mut expects) = (0usize, false);
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
            break;
        }
        let lower = header.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            length = v.trim().parse().unwrap_or(0);
        }
        if lower.starts_with("expect:") {
            expects = true;
        }
    }
    let mut stream = stream;
    if expects {
        let _ = stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n");
    }
    let mut body = vec![0u8; length];
    let _ = reader.read_exact(&mut body);
    let envelope: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let payload: Value = envelope["payload"]
        .as_str()
        .and_then(|p| serde_json::from_str(p).ok())
        .unwrap_or(Value::Null);
    log.lock().unwrap().push((path.clone(), payload.clone()));
    let (status, reply) = match path.as_str() {
        "/v1/register" => (200, json!({ "instance": "v1.stub", "expiresAt": 0 })),
        "/v1/activate" => (200, json!({ "url": format!("{base}/confirm/v1.question") })),
        "/v1/send" => {
            let question = payload["text"]
                .as_str()
                .is_some_and(|t| t.contains("/confirm/v1.question"));
            if yes.load(Ordering::SeqCst) || question {
                (200, json!({ "delivered": true }))
            } else {
                (403, json!({ "error": "activation required" }))
            }
        }
        _ => (404, json!({ "error": "not found" })),
    };
    let text = reply.to_string();
    let _ = write!(
        stream,
        "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
        text.len()
    );
}

/// The app on the relay, with `https://kroma.test` as its public address.
pub fn relay_app(stub: &StubRelay) -> TestApp {
    let t = test_app_with_mail_relay(&stub.base);
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("emailDelivery".to_string(), json!("relay")),
            ("remoteUrl".to_string(), json!("https://kroma.test")),
            ("serverName".to_string(), json!("Home Cinema")),
        ]
        .into_iter()
        .collect(),
    );
    t
}

/// Every path the relay was asked, in order.
pub fn relay_paths(stub: &StubRelay) -> Vec<String> {
    stub.calls
        .lock()
        .unwrap()
        .iter()
        .map(|(p, _)| p.clone())
        .collect()
}
