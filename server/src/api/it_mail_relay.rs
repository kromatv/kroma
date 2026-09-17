//! Integration tests for what the server says to the mail relay, against a
//! stub relay on a local port: registration, the relay's refusal for a mailbox
//! that has not said yes, and the question the server then writes and sends.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{seed_session, send, test_app_with_mail_relay, TestApp};
use crate::model::Permission;

/// A relay that speaks just enough HTTP for curl: it registers anything, mints
/// one consent link, refuses a send to a mailbox that has not said yes unless
/// the message is the question, and records every path it was asked.
struct StubRelay {
    base: String,
    calls: Arc<Mutex<Vec<(String, Value)>>>,
    consented: Arc<AtomicBool>,
}

fn stub_relay() -> StubRelay {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind the stub relay");
    let base = format!("http://{}", listener.local_addr().expect("stub address"));
    let calls = Arc::new(Mutex::new(Vec::new()));
    let consented = Arc::new(AtomicBool::new(false));
    let (log, yes, at) = (calls.clone(), consented.clone(), base.clone());
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            answer(stream, &at, &log, &yes);
        }
    });
    StubRelay {
        base,
        calls,
        consented,
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
        "/v1/consent" => (200, json!({ "url": format!("{base}/confirm/v1.question") })),
        "/v1/send" => {
            let question = payload["text"]
                .as_str()
                .is_some_and(|t| t.contains("/confirm/v1.question"));
            if yes.load(Ordering::SeqCst) || question {
                (200, json!({ "delivered": true }))
            } else {
                (403, json!({ "error": "consent required" }))
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

fn relay_app(stub: &StubRelay) -> TestApp {
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

fn paths(stub: &StubRelay) -> Vec<String> {
    stub.calls
        .lock()
        .unwrap()
        .iter()
        .map(|(p, _)| p.clone())
        .collect()
}

#[tokio::test]
async fn the_relay_probe_registers_then_asks_the_owners_mailbox_when_it_has_not_said_yes() {
    let stub = stub_relay();
    let t = relay_app(&stub);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["sentTo"], json!("owner@test.dev"));
    assert_eq!(body["asked"], json!(true));
    assert_eq!(
        paths(&stub),
        ["/v1/register", "/v1/send", "/v1/consent", "/v1/send"]
    );
    let calls = stub.calls.lock().unwrap();
    let question = &calls[3].1;
    assert_eq!(question["to"], json!("owner@test.dev"));
    assert!(question["subject"]
        .as_str()
        .unwrap()
        .contains("Home Cinema"));
    assert!(question["text"]
        .as_str()
        .unwrap()
        .contains("/confirm/v1.question"));
    assert!(!question["text"].as_str().unwrap().contains("kroma.test"));
    assert_eq!(question["attachments"][0]["contentId"], json!("logo"));
    assert!(!t
        .state
        .settings
        .get_str("mailRelay.instance", "")
        .is_empty());
}

#[tokio::test]
async fn the_relay_probe_delivers_once_the_mailbox_said_yes() {
    let stub = stub_relay();
    stub.consented.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body.get("asked").is_none());
    assert_eq!(paths(&stub), ["/v1/register", "/v1/send"]);
}

#[tokio::test]
async fn a_members_verification_is_the_question_and_their_reset_waits_for_the_answer() {
    let stub = stub_relay();
    let t = relay_app(&stub);
    let (uid, _) = seed_session(&t.state, "pat@test.dev", "pat", &[Permission::Playback]);

    let (_, reset) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(reset["delivered"], json!("unconfirmed"));

    let (_, verification) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(verification["delivered"], json!("relay"));
    let calls = stub.calls.lock().unwrap();
    let question = &calls.last().unwrap().1;
    assert_eq!(question["to"], json!("pat@test.dev"));
    assert!(question["html"]
        .as_str()
        .unwrap()
        .contains("/confirm/v1.question"));

    drop(calls);
    stub.consented.store(true, Ordering::SeqCst);
    let (_, reset) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(reset["delivered"], json!("relay"));
    let calls = stub.calls.lock().unwrap();
    let message = &calls.last().unwrap().1;
    assert!(message["html"]
        .as_str()
        .unwrap()
        .contains("https://kroma.test/reset?token="));
}

#[tokio::test]
async fn the_relay_probe_reports_a_relay_that_is_not_there_in_the_owners_words() {
    let t = test_app_with_mail_relay("http://127.0.0.1:1");
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("emailDelivery".to_string(), json!("relay")),
            ("remoteUrl".to_string(), json!("https://kroma.test")),
        ]
        .into_iter()
        .collect(),
    );

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let reason = body["error"].as_str().unwrap_or_default();
    assert!(reason.contains("unreachable"), "{reason}");
    assert!(!reason.starts_with("admin."), "{reason}");
}
