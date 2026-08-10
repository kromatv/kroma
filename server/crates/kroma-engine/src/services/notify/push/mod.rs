//! Push delivery: getting a notification onto a device whose app is closed.
//! Three transports, one delivery loop. Delivery is best-effort: a push that
//! fails leaves the in-app notification exactly where it was.

mod transports;

use std::sync::{Arc, Mutex, OnceLock};

use kroma_db::push_subs::{self, PushSubscription};
use kroma_module_host::HostCtx;
use kroma_push::webpush::VapidKey;
use kroma_push::Urgency;
use serde_json::json;

use kroma_domain::{
    Notification, NotificationCategory, NotificationEvent, User,
};

use crate::db;
use crate::services::jobs::now_ms;

// Rotating these invalidates every existing browser subscription.
pub const VAPID_PUBLIC_KEY: &str = "notifications.vapid.publicKey";
pub const VAPID_PRIVATE_KEY: &str = "notifications.vapid.privateKey";

// Apple only accepts a JWT signed by a `.p8` key THEY issued, so unlike Web
// Push this cannot be self-minted; absent = iOS push is off.
pub const APNS_KEY_P8: &str = "notifications.apns.keyP8";
pub const APNS_KEY_ID: &str = "notifications.apns.keyId";
pub const APNS_TEAM_ID: &str = "notifications.apns.teamId";

pub const FCM_SERVICE_ACCOUNT: &str = "notifications.fcm.serviceAccount";

// Sent as `apns-topic`; mirrors `bundleIdentifier` in `clients/mobile/app.json`.
const APNS_TOPIC: &str = "tv.kroma.mobile";

const DEFAULT_SUBJECT: &str = "mailto:admin@kroma.invalid";

// Env is read first so a distribution can carry the app's own Apple and Google
// keys; the stored setting is the fallback a fork writes to.
fn from_env_or_setting<S: HostCtx>(state: &S, var: &str, key: &str) -> String {
    match std::env::var(var) {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => state.setting_str(key, "").trim().to_string(),
    }
}

/// The server's VAPID public key, minting the keypair on first call.
pub fn public_key<S: HostCtx>(state: &S) -> anyhow::Result<String> {
    if let Some(key) = keys_for(&credentials(state)).web.as_ref() {
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

// The RFC 8292 `sub` claim. Must be a `mailto:` or `https:` URL and must never
// be empty — an empty `sub` is not an absent one, and FCM rejects the token.
fn subject_of<S: HostCtx>(state: &S) -> String {
    public_url_of(state).unwrap_or_else(|| DEFAULT_SUBJECT.to_string())
}

fn public_url_of<S: HostCtx>(state: &S) -> Option<String> {
    let public = state.setting_str("remoteUrl", "");
    let public = public.trim().trim_end_matches('/');
    let usable = public.starts_with("https://") || public.starts_with("http://");
    usable.then(|| public.to_string())
}

/// The configured transports and their credentials, built once per emission.
pub type Sender = transports::Senders;

// Compared raw so a `.p8` pasted into the admin console takes effect on the
// next push rather than after a restart.
#[derive(Clone, PartialEq, Eq)]
struct Credentials {
    vapid_private: String,
    apns_p8: String,
    apns_key_id: String,
    apns_team_id: String,
    apns_topic: String,
    fcm_service_account: String,
}

// Parsed credentials, kept between emissions: each key caches its bearer token
// internally, and Apple rate-limits JWT signing to one per 20 minutes per key.
#[derive(Default)]
struct Keys {
    web: Option<Arc<VapidKey>>,
    apns: Option<Arc<kroma_push::apns::ApnsKey>>,
    fcm: Option<Arc<kroma_push::fcm::FcmKey>>,
}

type Cached = Mutex<Option<(Credentials, Arc<Keys>)>>;

static PARSED: OnceLock<Cached> = OnceLock::new();

fn credentials<S: HostCtx>(state: &S) -> Credentials {
    Credentials {
        vapid_private: state.setting_str(VAPID_PRIVATE_KEY, ""),
        apns_p8: from_env_or_setting(state, "KROMA_APNS_KEY_P8", APNS_KEY_P8),
        apns_key_id: from_env_or_setting(state, "KROMA_APNS_KEY_ID", APNS_KEY_ID),
        apns_team_id: from_env_or_setting(state, "KROMA_APNS_TEAM_ID", APNS_TEAM_ID),
        apns_topic: match std::env::var("KROMA_APNS_TOPIC") {
            Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
            _ => APNS_TOPIC.to_string(),
        },
        fcm_service_account: from_env_or_setting(
            state,
            "KROMA_FCM_SERVICE_ACCOUNT",
            FCM_SERVICE_ACCOUNT,
        ),
    }
}

fn keys_for(credentials: &Credentials) -> Arc<Keys> {
    let slot = PARSED.get_or_init(|| Mutex::new(None));
    let mut slot = slot.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((known, keys)) = slot.as_ref() {
        if known == credentials {
            return Arc::clone(keys);
        }
    }
    let keys = Arc::new(parse(credentials));
    *slot = Some((credentials.clone(), Arc::clone(&keys)));
    keys
}

// Each transport is independent: an unusable Apple key must not take Web Push
// down with it.
fn parse(credentials: &Credentials) -> Keys {
    let web = if credentials.vapid_private.is_empty() {
        None
    } else {
        match VapidKey::from_base64url(&credentials.vapid_private) {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "stored VAPID key is unusable");
                None
            }
        }
    };

    let apns = if credentials.apns_p8.is_empty() {
        None
    } else {
        let key = kroma_push::apns::ApnsKey::new(
            &credentials.apns_p8,
            credentials.apns_key_id.clone(),
            credentials.apns_team_id.clone(),
            credentials.apns_topic.clone(),
            // Where the FIRST attempt goes: a token's environment is a property
            // of the token, and production covers all but development installs.
            kroma_push::apns::Environment::Production,
        );
        match key {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "APNs credentials are unusable; iOS push disabled");
                None
            }
        }
    };

    let fcm = if credentials.fcm_service_account.is_empty() {
        None
    } else {
        match kroma_push::fcm::FcmKey::new(&credentials.fcm_service_account) {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                tracing::error!(error = %e, "FCM credentials are unusable; Android push disabled");
                None
            }
        }
    };

    Keys { web, apns, fcm }
}

/// The server's push identity for this emission.
pub fn sender<S: HostCtx>(state: &S) -> Sender {
    let keys = keys_for(&credentials(state));
    transports::Senders {
        web: keys
            .web
            .clone()
            .map(|key| transports::WebPush { key, subject: subject_of(state) }),
        apns: keys.apns.clone().map(|key| transports::Apns { key }),
        // The token exchange is a network call: once per emission, not per device.
        fcm: keys.fcm.clone().and_then(|key| match fcm_access_token(&key) {
            Ok(access_token) => Some(transports::Fcm { key, access_token }),
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "could not obtain an FCM access token; Android push skipped"
                );
                None
            }
        }),
    }
}

fn fcm_access_token(key: &kroma_push::fcm::FcmKey) -> anyhow::Result<String> {
    let now = now_ms() / 1_000;
    if let Some(token) = key.cached_token(now) {
        return Ok(token);
    }
    let request = key.token_request(now)?;
    let response = send(&request)?;
    if !(200..300).contains(&response.status) {
        anyhow::bail!("token endpoint returned {}: {}", response.status, response.text());
    }
    key.store_token(&response.text(), now)
}

/// Sends to every endpoint `user_id` has registered and returns how many
/// accepted it. Any failure here costs a push, never the in-app notification.
pub fn deliver<S: HostCtx>(
    state: &S,
    sender: &Sender,
    user_id: &str,
    notification: &Notification,
) -> usize {
    // Scoped deliberately: everything below is blocking network I/O and takes
    // connections of its own, so holding one across the sends pins a pool slot
    // and contends with the very pool it is about to ask again.
    let subs = {
        let Ok(conn) = state.db().get() else {
            return 0;
        };
        push_subs::subscriptions_for_user(&conn, user_id).unwrap_or_default()
    };
    if subs.is_empty() {
        return 0;
    }
    let payload = payload_of(notification);
    let out = transports::Outgoing {
        notification,
        web_payload: &payload,
        urgency: urgency_of(notification),
        actions: transports::native_actions(notification),
        native_image: super::art::native_image_url(notification, public_url_of(state).as_deref()),
    };

    let mut sent = 0;
    for sub in subs {
        match send_one(state, sender, &sub, &out) {
            Ok(true) => sent += 1,
            Ok(false) => {}
            Err(e) => tracing::warn!(error = %e, endpoint = %sub.endpoint, "push failed"),
        }
    }
    sent
}

/// Sends one "push is working" message to a user's own devices, deliberately
/// bypassing the category preferences: the user just pressed the button.
pub fn send_test<S: HostCtx>(state: &S, user: &User) -> anyhow::Result<usize> {
    let sender = sender(state);
    let locale = crate::i18n::user_locale(user);
    let notification = Notification {
        id: "test".into(),
        category: NotificationCategory::System,
        event: NotificationEvent::SystemTest,
        title: crate::i18n::t(locale, "notifications.test.title", &[]),
        body: crate::i18n::t(locale, "notifications.test.body", &[]),
        link: Some("/".into()),
        image_url: None,
        actions: Vec::new(),
        push_category: None,
        read: false,
        created_at: now_ms(),
    };
    Ok(deliver(state, &sender, &user.id, &notification))
}

// `Ok(false)` = not delivered but handled (dropped as gone, or a transport
// this server has no credentials for).
fn send_one<S: HostCtx>(
    state: &S,
    sender: &Sender,
    sub: &PushSubscription,
    out: &transports::Outgoing<'_>,
) -> anyhow::Result<bool> {
    let Some(mut request) = transports::build(sender, sub, out, now_ms() / 1_000)? else {
        return Ok(false); // transport not configured on this server
    };
    let mut response = send(&request)?;

    if transports::retry(sub, &mut request, response.status, &response.text()) {
        tracing::debug!(endpoint = %sub.endpoint, "retrying push after an adjustable rejection");
        response = send(&request)?;
    }

    if (200..300).contains(&response.status) {
        let _ = push_subs::record_success(state.db(), &sub.id, now_ms());
        return Ok(true);
    }
    let body = response.text();
    if transports::is_gone(sub, response.status, &body) {
        tracing::info!(
            endpoint = %sub.endpoint, status = response.status,
            "dropping dead push endpoint"
        );
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
        return Ok(false);
    }
    if is_transient(response.status) {
        // Not this endpoint's fault, so it earns no strike.
        anyhow::bail!("push service is unavailable ({}): {body}", response.status)
    }
    if push_subs::record_failure(state.db(), &sub.id).unwrap_or(false) {
        tracing::info!(endpoint = %sub.endpoint, "dropping push endpoint after repeated failures");
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
    }
    anyhow::bail!("push service returned {} {body}", response.status)
}

// Whether a rejection is the SERVICE's problem rather than this endpoint's. A
// 429 or 5xx hits every device at once, so counting it towards
// `push_subs::MAX_FAILURES` unsubscribes a whole household on one outage.
fn is_transient(status: u16) -> bool {
    // 408: no transport sends it today, but a proxy in front of one can.
    status == 408 || status == 429 || (500..600).contains(&status)
}

// `http2` is not a preference: APNs refuses HTTP/1.1 outright.
fn send(request: &kroma_push::PushRequest) -> anyhow::Result<kroma_http::Response> {
    let mut fetch = kroma_http::Fetch::new().max_time(15);
    if request.http2 {
        fetch = fetch.http2();
    }
    let mut content_type = "application/octet-stream";
    for (name, value) in &request.headers {
        if name.eq_ignore_ascii_case("content-type") {
            content_type = match value.as_str() {
                "application/json" => "application/json",
                "application/x-www-form-urlencoded" => "application/x-www-form-urlencoded",
                _ => "application/octet-stream",
            };
            continue; // `post_bytes` sets it; sending it twice confuses curl
        }
        fetch = fetch.header(name, value.clone());
    }
    fetch.post_bytes(&request.url, content_type, &request.body)
}

// Serialized straight from `Notification` rather than rebuilt field-by-field,
// so a push and the notification-centre row it mirrors cannot drift apart.
fn payload_of(n: &Notification) -> Vec<u8> {
    serde_json::to_vec(n).unwrap_or_else(|_| b"{}".to_vec())
}

// How hard to wake the device: something the user is waiting for is worth a
// radio wake, a media digest is not.
fn urgency_of(n: &Notification) -> Urgency {
    use kroma_domain::NotificationCategory as C;
    match n.category {
        C::Requests | C::Reports => Urgency::High,
        C::Downloads | C::System => Urgency::Normal,
        C::Media => Urgency::Low,
    }
}

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
            push_category: None,
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
        // Push services cap a message around 4 KiB.
        let raw = payload_of(&notification(NotificationCategory::Requests));
        assert!(raw.len() < kroma_push::webpush::MAX_PAYLOAD, "payload was {} bytes", raw.len());
    }

    #[test]
    fn the_subject_is_derived_and_never_empty() {
        let state = crate::test_support::test_state();
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);

        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("   "),
        )]));
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT, "whitespace is still no address");

        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("https://kroma.example.com/"),
        )]));
        assert_eq!(subject_of(&state), "https://kroma.example.com", "trailing slash trimmed");

        // A bare hostname is not a valid `sub`.
        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("kroma.example.com"),
        )]));
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);
    }

    #[test]
    fn urgency_follows_how_much_the_user_is_waiting() {
        assert_eq!(urgency_of(&notification(NotificationCategory::Requests)), Urgency::High);
        assert_eq!(urgency_of(&notification(NotificationCategory::Reports)), Urgency::High);
        assert_eq!(urgency_of(&notification(NotificationCategory::Downloads)), Urgency::Normal);
        assert_eq!(urgency_of(&notification(NotificationCategory::Media)), Urgency::Low);
    }

    // `Fetch` shells out to curl, so a socket is the only seam.

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
    fn a_distributions_own_credentials_take_precedence_over_a_stored_one() {
        let var = "KROMA_TEST_PUSH_KEY_ID";
        let state = crate::test_support::test_state();
        state.set_settings(std::collections::BTreeMap::from([(
            APNS_KEY_ID.to_string(),
            json!("  FROMTHEDB  "),
        )]));
        assert_eq!(from_env_or_setting(&state, var, APNS_KEY_ID), "FROMTHEDB");

        std::env::set_var(var, "  FROMTHEENV  ");
        assert_eq!(from_env_or_setting(&state, var, APNS_KEY_ID), "FROMTHEENV", "trimmed, and it wins");

        std::env::set_var(var, "   ");
        assert_eq!(
            from_env_or_setting(&state, var, APNS_KEY_ID),
            "FROMTHEDB",
            "a blank variable is not a configured one"
        );
        std::env::remove_var(var);
    }

    #[test]
    fn a_fork_can_rename_the_bundle_the_apple_push_is_addressed_to() {
        let state = crate::test_support::test_state();
        assert_eq!(credentials(&state).apns_topic, APNS_TOPIC);

        std::env::set_var("KROMA_APNS_TOPIC", "  tv.kroma.fork  ");
        assert_eq!(credentials(&state).apns_topic, "tv.kroma.fork");

        std::env::set_var("KROMA_APNS_TOPIC", "   ");
        assert_eq!(credentials(&state).apns_topic, APNS_TOPIC, "a blank one is not a rename");
        std::env::remove_var("KROMA_APNS_TOPIC");
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

    #[test]
    fn an_unusable_apple_key_disables_ios_push_and_nothing_else() {
        let state = crate::test_support::test_state();
        public_key(&state).unwrap();
        state.set_settings(std::collections::BTreeMap::from([
            (APNS_KEY_P8.to_string(), json!("-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----")),
            (APNS_KEY_ID.to_string(), json!("ABC1234567")),
            (APNS_TEAM_ID.to_string(), json!("TEAM123456")),
        ]));

        let keys = keys_for(&credentials(&state));
        assert!(keys.apns.is_none(), "a .p8 that does not parse is not an identity");
        assert!(keys.web.is_some(), "Web Push is independent of Apple");
    }

    #[test]
    fn an_apple_key_that_parses_becomes_this_servers_ios_identity() {
        let state = crate::test_support::test_state();
        public_key(&state).unwrap();
        state.set_settings(std::collections::BTreeMap::from([
            (APNS_KEY_P8.to_string(), json!(crate::test_support::test_apns_key_p8())),
            (APNS_KEY_ID.to_string(), json!("ABC1234567")),
            (APNS_TEAM_ID.to_string(), json!("TEAM123456")),
        ]));

        let sender = sender(&state);
        assert!(sender.apns.is_some(), "the key should have become a sender");
        assert!(sender.has_own_credentials());
    }

    #[test]
    fn unusable_google_credentials_disable_android_push_and_nothing_else() {
        let state = crate::test_support::test_state();
        public_key(&state).unwrap();
        for broken in ["{}", "not json at all", r#"{"project_id":"p","client_email":"e","private_key":"nope"}"#] {
            state.set_settings(std::collections::BTreeMap::from([(
                FCM_SERVICE_ACCOUNT.to_string(),
                json!(broken),
            )]));
            let keys = keys_for(&credentials(&state));
            assert!(keys.fcm.is_none(), "{broken} must not become an identity");
            assert!(keys.web.is_some());
        }
    }

    #[test]
    fn the_public_key_is_minted_once_and_then_reused() {
        let state = crate::test_support::test_state();
        let first = public_key(&state).unwrap();
        assert!(!first.is_empty());
        assert_eq!(public_key(&state).unwrap(), first);
        assert_eq!(
            keys_for(&credentials(&state)).web.as_ref().unwrap().public_base64url(),
            first
        );
    }
}
