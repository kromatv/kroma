//! Push delivery: getting a notification onto a device whose app is closed.
//!
//! Web Push is the transport that needs nothing from anyone. The server holds a
//! VAPID keypair (minted here on first use, kept in settings), the browser
//! subscribes with the public half, and messages go straight to that browser's
//! push service. No account, no relay, no shared secret so it works from a NAS
//! on a home LAN, which is the whole point.
//!
//! Delivery is best-effort and never blocks the thing that caused it: a push
//! that fails leaves the in-app notification exactly where it was.

use kroma_db::push_subs::{self, PushSubscription};
use kroma_module_host::HostCtx;
use kroma_webpush::{Subscription, Urgency, VapidKey};
use serde_json::json;

use kroma_domain::{Notification, PushTransport};

use crate::db;
use crate::services::jobs::now_ms;

/// Settings keys for the server's VAPID identity. Rotating these invalidates
/// every existing browser subscription, so they are written once and left alone.
pub const VAPID_PUBLIC_KEY: &str = "notifications.vapid.publicKey";
pub const VAPID_PRIVATE_KEY: &str = "notifications.vapid.privateKey";
/// RFC 8292 `sub` claim: who a push service operator contacts about this sender.
pub const PUSH_SUBJECT_KEY: &str = "notifications.push.subject";

/// Fallback contact when the operator has not set one. A `mailto:` is required
/// to be present, not to be reachable; push services use it only for abuse
/// reports, and a self-hoster has no public address to offer.
const DEFAULT_SUBJECT: &str = "mailto:admin@kroma.invalid";

/// The server's VAPID public key, minting the keypair on first call.
///
/// Lazily created rather than at startup: a server whose users never enable push
/// never needs one, and generating it on demand keeps the key out of fresh
/// installs that will never use it.
pub fn public_key<S: HostCtx>(state: &S) -> anyhow::Result<String> {
    if let Some(key) = stored_key(state) {
        return Ok(key.public_base64url());
    }
    let key = VapidKey::generate();
    let public = key.public_base64url();
    state.set_settings(std::collections::BTreeMap::from([
        (VAPID_PUBLIC_KEY.to_string(), json!(public)),
        (VAPID_PRIVATE_KEY.to_string(), json!(key.private_base64url())),
    ]));
    tracing::info!("minted a VAPID keypair for Web Push");
    Ok(public)
}

/// The RFC 8292 `sub` claim.
///
/// The setting's registered default is the empty string (an operator has not
/// chosen a contact), and an EMPTY `sub` is not the same as an absent one: FCM
/// rejects the token outright. So empty falls back to a syntactically valid
/// placeholder rather than being passed through.
fn subject_of<S: HostCtx>(state: &S) -> String {
    let configured = state.setting_str(PUSH_SUBJECT_KEY, "");
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        return DEFAULT_SUBJECT.to_string();
    }
    trimmed.to_string()
}

fn stored_key<S: HostCtx>(state: &S) -> Option<VapidKey> {
    let private = state.setting_str(VAPID_PRIVATE_KEY, "");
    if private.is_empty() {
        return None;
    }
    match VapidKey::from_base64url(&private) {
        Ok(key) => Some(key),
        Err(e) => {
            // A corrupted key would otherwise fail every push forever with no
            // clue why; say so loudly and let the caller mint a fresh one.
            tracing::error!(error = %e, "stored VAPID key is unusable");
            None
        }
    }
}

/// Send one rendered notification to every endpoint `user_id` has registered.
///
/// Returns how many endpoints accepted it. Called after the in-app row is
/// already written, so any failure here costs a push, never the notification.
pub fn deliver<S: HostCtx>(state: &S, user_id: &str, notification: &Notification) -> usize {
    let subs = {
        let Ok(conn) = state.db().get() else { return 0 };
        push_subs::subscriptions_for_user(&conn, user_id).unwrap_or_default()
    };
    if subs.is_empty() {
        return 0;
    }
    let Some(key) = stored_key(state) else {
        // Endpoints exist but the key is gone: minting a new one now would not
        // match what those browsers subscribed with, so this needs an operator.
        tracing::warn!("push subscriptions exist but no usable VAPID key; skipping");
        return 0;
    };
    let subject = subject_of(state);
    let payload = payload_of(notification);
    let urgency = urgency_of(notification);

    let mut sent = 0;
    for sub in subs {
        match send_one(state, &key, &sub, &payload, &subject, urgency) {
            Ok(true) => sent += 1,
            Ok(false) => {}
            Err(e) => tracing::warn!(error = %e, endpoint = %sub.endpoint, "push failed"),
        }
    }
    sent
}

/// Deliver to one endpoint, updating its health. `Ok(false)` = not delivered but
/// handled (dropped as gone, or an unsupported transport).
fn send_one<S: HostCtx>(
    state: &S,
    key: &VapidKey,
    sub: &PushSubscription,
    payload: &[u8],
    subject: &str,
    urgency: Urgency,
) -> anyhow::Result<bool> {
    if sub.transport != PushTransport::WebPush {
        // apns / fcm are a later phase; their rows are simply not delivered yet
        // rather than being mangled through the Web Push encoding.
        return Ok(false);
    }
    let (Some(p256dh), Some(auth)) = (sub.p256dh.clone(), sub.auth.clone()) else {
        anyhow::bail!("web push subscription {} is missing its keys", sub.id);
    };

    let request = kroma_webpush::build_request(
        key,
        &Subscription { endpoint: sub.endpoint.clone(), p256dh, auth },
        payload,
        subject,
        urgency,
        now_secs(),
    )?;

    let mut fetch = kroma_http::Fetch::new().max_time(15);
    for (name, value) in &request.headers {
        fetch = fetch.header(name, value.clone());
    }
    let response = fetch.post_bytes(&request.url, "application/octet-stream", &request.body)?;

    if (200..300).contains(&response.status) {
        let _ = push_subs::record_success(state.db(), &sub.id, now_ms());
        return Ok(true);
    }
    if kroma_webpush::is_gone(response.status) {
        // The browser unsubscribed or the user cleared site data. Permanent.
        tracing::info!(endpoint = %sub.endpoint, status = response.status, "dropping dead push endpoint");
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
        return Ok(false);
    }
    if push_subs::record_failure(state.db(), &sub.id).unwrap_or(false) {
        tracing::info!(endpoint = %sub.endpoint, "dropping push endpoint after repeated failures");
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
    }
    anyhow::bail!("push service returned {}", response.status)
}

/// What the service worker receives. Deliberately the same field names as the
/// in-app [`Notification`], so `sw.js` needs no translation layer and a push and
/// its notification-centre row can never disagree.
fn payload_of(n: &Notification) -> Vec<u8> {
    let body = json!({
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "category": n.category.as_str(),
        "event": n.event.as_str(),
        "link": n.link,
        "imageUrl": n.image_url,
        "actions": n.actions.iter().map(|a| json!({
            "id": a.id,
            "label": a.label,
            "kind": a.kind,
            "href": a.href,
            "method": a.method,
        })).collect::<Vec<_>>(),
    });
    body.to_string().into_bytes()
}

/// How hard to wake the device. Something the user is actively waiting for
/// (their request landed) is worth a radio wake; a media digest is not.
fn urgency_of(n: &Notification) -> Urgency {
    use kroma_domain::NotificationCategory as C;
    match n.category {
        C::Requests | C::Reports => Urgency::High,
        C::Downloads | C::System => Urgency::Normal,
        C::Media => Urgency::Low,
    }
}

fn now_secs() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// Whether this user has any push endpoint (drives the settings toggle).
pub fn is_subscribed<S: HostCtx>(state: &S, user_id: &str) -> bool {
    let Ok(conn) = state.db().get() else { return false };
    db::push_subs::has_subscription(&conn, user_id).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::{NotificationAction, NotificationCategory, NotificationEvent};

    fn notification(category: NotificationCategory) -> Notification {
        Notification {
            id: "n1".into(),
            category,
            event: NotificationEvent::RequestAvailable,
            title: "Ready to watch".into(),
            body: "Dune is now in your library.".into(),
            link: Some("/movie/ab12".into()),
            image_url: Some("https://img/p.jpg".into()),
            actions: vec![NotificationAction {
                id: "watch".into(),
                label: "Watch".into(),
                kind: kroma_domain::ActionKind::Link,
                href: "/movie/ab12".into(),
                method: None,
                style: kroma_domain::ActionStyle::Primary,
            }],
            read: false,
            created_at: 1_700_000_000_000,
        }
    }

    #[test]
    fn the_payload_mirrors_the_in_app_row() {
        let raw = payload_of(&notification(NotificationCategory::Requests));
        let v: serde_json::Value = serde_json::from_slice(&raw).unwrap();
        assert_eq!(v["id"], "n1");
        assert_eq!(v["title"], "Ready to watch");
        assert_eq!(v["link"], "/movie/ab12");
        assert_eq!(v["imageUrl"], "https://img/p.jpg");
        assert_eq!(v["category"], "requests");
        assert_eq!(v["event"], "request.available");
        assert_eq!(v["actions"][0]["id"], "watch");
        assert_eq!(v["actions"][0]["label"], "Watch");
    }

    #[test]
    fn the_payload_fits_a_single_push_record() {
        // Push services cap a message around 4 KiB; our own encoder caps at
        // MAX_PAYLOAD. A realistic notification must be nowhere near it.
        let raw = payload_of(&notification(NotificationCategory::Requests));
        assert!(raw.len() < kroma_webpush::MAX_PAYLOAD, "payload was {} bytes", raw.len());
    }

    #[test]
    fn an_unset_or_blank_subject_falls_back_to_a_valid_one() {
        // The registered settings default is "", which would otherwise reach the
        // JWT as an empty `sub` claim and get the token rejected by FCM.
        let state = crate::test_support::test_state();
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);

        state.set_settings(std::collections::BTreeMap::from([(
            PUSH_SUBJECT_KEY.to_string(),
            json!("   "),
        )]));
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT, "whitespace is still blank");

        state.set_settings(std::collections::BTreeMap::from([(
            PUSH_SUBJECT_KEY.to_string(),
            json!("mailto:ops@example.com"),
        )]));
        assert_eq!(subject_of(&state), "mailto:ops@example.com");
    }

    #[test]
    fn urgency_follows_how_much_the_user_is_waiting() {
        assert_eq!(urgency_of(&notification(NotificationCategory::Requests)), Urgency::High);
        assert_eq!(urgency_of(&notification(NotificationCategory::Reports)), Urgency::High);
        assert_eq!(urgency_of(&notification(NotificationCategory::Downloads)), Urgency::Normal);
        // A "12 new titles" digest should never wake a sleeping phone's radio.
        assert_eq!(urgency_of(&notification(NotificationCategory::Media)), Urgency::Low);
    }
    // ----- delivery against a fake push service -----------------------------------
    //
    // `Fetch` shells out to curl, so a socket is the only seam. These drive the
    // real signed request and, more to the point, the endpoint-health rules:
    // which failures retire a device and which ones are just a bad night.

    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use kroma_db::push_subs::{self, NewSubscription};
    use kroma_domain::PushTransport;

    /// A push service that answers every POST with the same status.
    struct FakeService {
        endpoint: String,
        hits: Arc<Mutex<usize>>,
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
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 {
                        continue;
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

    /// A state with a real VAPID key, an account, and one registered endpoint.
    fn state_with_endpoint(
        endpoint: &str,
        transport: PushTransport,
        keys: bool,
    ) -> (crate::state::SharedState, String) {
        let state = crate::test_support::test_state();
        // Mint a real key: `deliver` refuses to send without one.
        public_key(&state).unwrap();
        let user = kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id;
        // A subscriber's p256dh is a P-256 public point, which is exactly the
        // shape of a VAPID public key - so one can stand in for the other.
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
                locale: Some("en".into()),
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
        let sent = deliver(&state, &user, &notification(NotificationCategory::Requests));
        assert_eq!(sent, 1);
        assert_eq!(service.hits(), 1);
        assert_eq!(subscription_count(&state, &user), 1, "a working endpoint is kept");
    }

    #[test]
    fn an_endpoint_the_browser_retired_is_dropped_on_the_spot() {
        // 404/410 is permanent - the browser unsubscribed or the user cleared
        // site data. Keeping the row would mean pushing into the void forever.
        for gone in [404u16, 410] {
            let service = FakeService::answering(gone);
            let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
            assert_eq!(deliver(&state, &user, &notification(NotificationCategory::Requests)), 0);
            assert_eq!(subscription_count(&state, &user), 0, "{gone} should retire the endpoint");
        }
    }

    #[test]
    fn a_service_having_a_bad_night_is_kept_until_it_has_had_several() {
        // A 500 is transient. Dropping on the first one would unsubscribe every
        // device during a push-service outage, and they would not come back
        // until each user re-granted permission.
        let service = FakeService::answering(500);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
        let note = notification(NotificationCategory::Requests);

        for attempt in 1..push_subs::MAX_FAILURES {
            assert_eq!(deliver(&state, &user, &note), 0);
            assert_eq!(subscription_count(&state, &user), 1, "dropped after only {attempt}");
        }
        // The failure that reaches the ceiling retires it.
        assert_eq!(deliver(&state, &user, &note), 0);
        assert_eq!(subscription_count(&state, &user), 0);
    }

    #[test]
    fn a_success_forgives_the_failures_before_it() {
        // Otherwise a device that has been online for months would eventually
        // accumulate its way to being dropped.
        let failing = FakeService::answering(500);
        let (state, user) = state_with_endpoint(&failing.endpoint, PushTransport::WebPush, true);
        let note = notification(NotificationCategory::Requests);
        deliver(&state, &user, &note);
        deliver(&state, &user, &note);

        // Re-point the same subscription id at a service that works.
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
        assert_eq!(deliver(&state, &user, &note), 1);

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
        // APNs/FCM rows are stored but not deliverable yet. They must be skipped
        // rather than mangled through the Web Push encoding - and above all not
        // counted as failures, which would eventually delete the device.
        let service = FakeService::answering(201);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::Apns, true);
        assert_eq!(deliver(&state, &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(service.hits(), 0, "nothing should have been sent");
        assert_eq!(subscription_count(&state, &user), 1, "the device stays registered");
    }

    #[test]
    fn a_web_push_row_without_its_keys_fails_that_endpoint_only() {
        // Without p256dh/auth there is nothing to encrypt to. It is an error,
        // not a panic, and it must not take the whole delivery down.
        let service = FakeService::answering(201);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, false);
        assert_eq!(deliver(&state, &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(service.hits(), 0);
    }

    #[test]
    fn no_endpoints_means_no_work_at_all() {
        let state = crate::test_support::test_state();
        let user = kroma_db::create_user(&state.db, "ana@t.dev", "Ana", "h", &[]).unwrap().id;
        assert_eq!(deliver(&state, &user, &notification(NotificationCategory::Media)), 0);
        assert!(!is_subscribed(&state, &user));
    }

    #[test]
    fn endpoints_without_a_usable_key_are_skipped_rather_than_re_keyed() {
        // Minting a fresh keypair here would not match what those browsers
        // subscribed with, so every push would be rejected anyway. This needs an
        // operator, and the endpoints must survive until one shows up.
        let service = FakeService::answering(201);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
        assert!(is_subscribed(&state, &user));

        // Wipe the key, then corrupt it - both mean "no usable key".
        for broken in ["", "not-a-base64url-key"] {
            state.set_settings(std::collections::BTreeMap::from([(
                VAPID_PRIVATE_KEY.to_string(),
                json!(broken),
            )]));
            assert!(stored_key(&state).is_none(), "{broken:?} must not be usable");
            assert_eq!(deliver(&state, &user, &notification(NotificationCategory::Requests)), 0);
            assert_eq!(service.hits(), 0);
            assert_eq!(subscription_count(&state, &user), 1, "the endpoint is not the problem");
        }
    }

    #[test]
    fn the_public_key_is_minted_once_and_then_reused() {
        // The browser subscribes against this exact key; handing out a new one
        // on every call would invalidate every existing subscription.
        let state = crate::test_support::test_state();
        let first = public_key(&state).unwrap();
        assert!(!first.is_empty());
        assert_eq!(public_key(&state).unwrap(), first);
        assert_eq!(stored_key(&state).unwrap().public_base64url(), first);
    }
}
