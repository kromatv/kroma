use kroma_module_host::HostCtx;
use kroma_push::webpush::VapidKey;
use serde_json::json;

use super::*;
use crate::services::notify::push::credentials::{credentials, keys_for};
use crate::services::notify::push::{is_subscribed, public_key, VAPID_PRIVATE_KEY};
use crate::services::notify::push::test_support::notification;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use kroma_db::push_subs::{self, NewSubscription};
use kroma_domain::PushTransport;

struct FakeService {
    endpoint: String,
    hits: Arc<Mutex<usize>>,
}

fn drain_request(stream: &std::net::TcpStream) -> bool {
    let Ok(clone) = stream.try_clone() else { return false };
    let mut reader = BufReader::new(clone);
    let mut line = String::new();
    if reader.read_line(&mut line).unwrap_or(0) == 0 {
        return false;
    }
    let mut len = 0usize;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
            break;
        }
        if let Some(v) = header.to_ascii_lowercase().strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0);
        }
    }
    if len > 0 {
        let mut body = vec![0u8; len];
        let _ = reader.read_exact(&mut body);
    }
    true
}

impl FakeService {
    fn answering(status: u16) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().unwrap().port();
        let hits = Arc::new(Mutex::new(0usize));
        let counter = Arc::clone(&hits);

        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                if !drain_request(&stream) {
                    continue;
                }
                *counter.lock().unwrap() += 1;
                let resp = format!(
                    "HTTP/1.1 {status} X\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
            }
        });

        Self { endpoint: format!("http://127.0.0.1:{port}/push/abc"), hits }
    }

    fn hits(&self) -> usize {
        *self.hits.lock().unwrap()
    }
}

fn state_with_endpoint(
    endpoint: &str,
    transport: PushTransport,
    keys: bool,
) -> (crate::state::SharedState, String) {
    let state = crate::test_support::test_state();
    // Mint a real key: `deliver` refuses to send without one.
    public_key(&state).unwrap();
    let user = kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id;
    // A subscriber's p256dh is a P-256 public point, the same shape as a
    // VAPID public key, so one can stand in for the other.
    let (p256dh, auth) = if keys {
        (Some(VapidKey::generate().public_base64url()), Some("MDEyMzQ1Njc4OWFiY2RlZg".to_string()))
    } else {
        (None, None)
    };
    push_subs::upsert_subscription(
        &state.db,
        &NewSubscription {
            id: "sub-1".into(),
            user_id: user.clone(),
            transport,
            endpoint: endpoint.to_string(),
            p256dh,
            auth,
            device: Some("Firefox".into()),
        },
        1,
    )
    .unwrap();
    (state, user)
}

fn subscription_count(state: &crate::state::SharedState, user: &str) -> usize {
    let conn = state.db.get().unwrap();
    push_subs::subscriptions_for_user(&conn, user).unwrap().len()
}

#[test]
fn a_push_the_service_accepts_is_counted() {
    let service = FakeService::answering(201);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    let sent = deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests));
    assert_eq!(sent, 1);
    assert_eq!(service.hits(), 1);
    assert_eq!(subscription_count(&state, &user), 1, "a working endpoint is kept");
}

#[test]
fn an_endpoint_the_browser_retired_is_dropped_on_the_spot() {
    for gone in [404u16, 410] {
        let service = FakeService::answering(gone);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
        assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(subscription_count(&state, &user), 0, "{gone} should retire the endpoint");
    }
}

#[test]
fn a_service_having_a_bad_night_never_costs_the_reader_their_registration() {
    let service = FakeService::answering(500);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    let note = notification(NotificationCategory::Requests);

    for attempt in 1..=push_subs::MAX_FAILURES + 2 {
        assert_eq!(deliver(&state, &sender(&state), &user, &note), 0);
        assert_eq!(subscription_count(&state, &user), 1, "dropped after {attempt}");
    }
}

#[test]
fn a_rate_limited_push_is_not_the_devices_fault_either() {
    // `digest::run` announces every followed show in one pass, so a big scan
    // earns the relay's 429s in bulk.
    let service = FakeService::answering(429);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    let note = notification(NotificationCategory::Media);

    for _ in 0..push_subs::MAX_FAILURES + 2 {
        assert_eq!(deliver(&state, &sender(&state), &user, &note), 0);
    }
    assert_eq!(subscription_count(&state, &user), 1);
}

#[test]
fn an_endpoint_that_keeps_being_refused_is_still_retired() {
    // A 400 is about THIS request reaching THIS endpoint, so an endpoint
    // that answers it forever is dead in every way except saying so.
    let service = FakeService::answering(400);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    let note = notification(NotificationCategory::Requests);

    for attempt in 1..push_subs::MAX_FAILURES {
        assert_eq!(deliver(&state, &sender(&state), &user, &note), 0);
        assert_eq!(subscription_count(&state, &user), 1, "dropped after only {attempt}");
    }
    assert_eq!(deliver(&state, &sender(&state), &user, &note), 0);
    assert_eq!(subscription_count(&state, &user), 0);
}

#[test]
fn a_success_forgives_the_failures_before_it() {
    let failing = FakeService::answering(500);
    let (state, user) = state_with_endpoint(&failing.endpoint, PushTransport::WebPush, true);
    let note = notification(NotificationCategory::Requests);
    deliver(&state, &sender(&state), &user, &note);
    deliver(&state, &sender(&state), &user, &note);

    let ok = FakeService::answering(201);
    state
        .db
        .get()
        .unwrap()
        .execute(
            "UPDATE push_subscriptions SET endpoint = ?1 WHERE id = 'sub-1'",
            [&ok.endpoint],
        )
        .unwrap();
    assert_eq!(deliver(&state, &sender(&state), &user, &note), 1);

    let failures: i64 = state
        .db
        .get()
        .unwrap()
        .query_row("SELECT failures FROM push_subscriptions WHERE id = 'sub-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(failures, 0, "a delivery must reset the streak");
}

#[test]
fn a_transport_we_cannot_speak_yet_is_left_alone() {
    // APNs/FCM rows are stored but not deliverable without credentials.
    let service = FakeService::answering(201);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::Apns, true);
    assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
    assert_eq!(service.hits(), 0, "nothing should have been sent");
    assert_eq!(subscription_count(&state, &user), 1, "the device stays registered");
}

#[test]
fn a_web_push_row_without_its_keys_fails_that_endpoint_only() {
    // Without p256dh/auth there is nothing to encrypt to.
    let service = FakeService::answering(201);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, false);
    assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
    assert_eq!(service.hits(), 0);
}

#[test]
fn a_database_the_server_cannot_reach_costs_a_push_and_nothing_more() {
    let service = FakeService::answering(201);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    let sender = sender(&state);
    let held: Vec<_> = (0..16).map(|_| state.db.get().unwrap()).collect();
    std::fs::remove_dir_all(&state.config.data_dir).unwrap();

    let note = notification(NotificationCategory::Requests);
    assert_eq!(deliver(&state, &sender, &user, &note), 0);
    assert_eq!(service.hits(), 0, "nothing was sent");
    assert!(!is_subscribed(&state, &user));
    drop(held);
}

#[test]
fn no_endpoints_means_no_work_at_all() {
    let state = crate::test_support::test_state();
    let user = kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id;
    assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Media)), 0);
    assert!(!is_subscribed(&state, &user));
}

#[test]
fn endpoints_without_a_usable_key_are_skipped_rather_than_re_keyed() {
    // A fresh keypair would not match what those browsers subscribed with.
    let service = FakeService::answering(201);
    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    assert!(is_subscribed(&state, &user));

    for broken in ["", "not-a-base64url-key"] {
        state.set_settings(std::collections::BTreeMap::from([(
            VAPID_PRIVATE_KEY.to_string(),
            json!(broken),
        )]));
        assert!(keys_for(&credentials(&state)).web.is_none(), "{broken:?} must not be usable");
        assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(service.hits(), 0);
        assert_eq!(subscription_count(&state, &user), 1, "the endpoint is not the problem");
    }
}

#[test]
fn a_caller_that_says_nothing_is_not_counted_as_a_push() {
    let service = FakeService::answering(201);
    let addr = service.endpoint.trim_start_matches("http://");
    let addr = addr.split('/').next().unwrap();
    drop(std::net::TcpStream::connect(addr).expect("connect"));

    let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
    assert_eq!(
        deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)),
        1,
        "the silent caller must not have consumed the listener"
    );
    assert_eq!(service.hits(), 1);
}
