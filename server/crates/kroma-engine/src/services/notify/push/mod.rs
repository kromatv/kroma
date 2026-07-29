//! Push delivery: getting a notification onto a device whose app is closed.
//!
//! Three transports, one delivery loop. Each [`transports`] module answers two
//! questions the shared code cannot ask itself how to build this device's
//! request, and which failures mean the device is gone while the loop below
//! owns everything else: preferences, the success/failure streak, and evicting
//! dead endpoints.
//!
//! Web Push is the one that needs nothing from anyone: the server mints its own
//! VAPID keypair, so a NAS on a home LAN can push to a browser with no account
//! anywhere. APNs and FCM cannot work that way an Apple auth key and a
//! Firebase service account are per-developer secrets so those are configured
//! by the operator (see the admin settings) and simply stay inactive until they
//! are. A server with none of them configured does no push work at all.
//!
//! Delivery is best-effort and never blocks the thing that caused it: a push
//! that fails leaves the in-app notification exactly where it was.

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

/// Settings keys for the server's VAPID identity. Rotating these invalidates
/// every existing browser subscription, so they are written once and left alone.
pub const VAPID_PUBLIC_KEY: &str = "notifications.vapid.publicKey";
pub const VAPID_PRIVATE_KEY: &str = "notifications.vapid.privateKey";

/// Apple credentials. Unlike Web Push these CANNOT be self-minted, and no code
/// change will make them so: Apple's own servers only accept a JWT signed by a
/// `.p8` key THEY issued against a developer account and registered in their
/// portal. A locally generated key is signed by nobody they trust.
///
/// So the credential does not belong to a deployment — it belongs to the
/// published app, and every KROMA server pushes to that same app. It arrives
/// with the server (env, and later a relay that holds the key on our side)
/// rather than being typed in by whoever installed this NAS. The settings key
/// remains only as the escape hatch for a fork that ships its OWN app under its
/// own Apple account; see [`apns_credential`]. Absent = iOS push is simply off.
pub const APNS_KEY_P8: &str = "notifications.apns.keyP8";
/// The auth key's id — the `AuthKey_XXXXXXXXXX.p8` suffix, so an upload reads it
/// off the filename rather than asking for it.
pub const APNS_KEY_ID: &str = "notifications.apns.keyId";
/// The 10-character Apple team. The one thing a `.p8` genuinely cannot yield:
/// it is a bare PKCS#8 key with no metadata, and a wrong `iss` is rejected
/// outright, so a fork supplying its own key must supply this alongside it.
pub const APNS_TEAM_ID: &str = "notifications.apns.teamId";

/// The Firebase service-account JSON, for Android. Same story as APNs, with the
/// same escape hatch: absent = Android push is off.
pub const FCM_SERVICE_ACCOUNT: &str = "notifications.fcm.serviceAccount";

/// The published app's bundle id, sent as `apns-topic`. A constant rather than a
/// setting because it is the same string on every KROMA server in the world —
/// mirrors `bundleIdentifier` in `clients/mobile/app.json`. A fork that renames
/// the app overrides it with the rest of its credential bundle.
const APNS_TOPIC: &str = "tv.kroma.mobile";

/// Fallback contact when nothing better can be derived. A `mailto:` is required
/// to be present, not to be reachable; push services use it only for abuse
/// reports, and a self-hoster has no public address to offer.
const DEFAULT_SUBJECT: &str = "mailto:admin@kroma.invalid";

/// A credential supplied with the server rather than by the operator.
///
/// Env is read first so that a distribution — a container image, a package, the
/// relay — can carry the app's own Apple and Google keys and leave the admin
/// with nothing to fill in. The stored setting is the fallback, which is what a
/// fork shipping its own build writes to.
fn from_env_or_setting<S: HostCtx>(state: &S, var: &str, key: &str) -> String {
    match std::env::var(var) {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => state.setting_str(key, "").trim().to_string(),
    }
}

/// The server's VAPID public key, minting the keypair on first call.
///
/// Lazily created rather than at startup: a server whose users never enable push
/// never needs one, and generating it on demand keeps the key out of fresh
/// installs that will never use it.
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

/// The RFC 8292 `sub` claim — derived, never asked for.
///
/// A push service uses this only to have someone to contact about an abusive
/// sender; nothing validates that it is reachable, and it must merely be a
/// `mailto:` or `https:` URL. That makes it pure ceremony to put in front of an
/// admin, so it comes from the address the server already knows it answers on,
/// and from a syntactically valid placeholder when it has no public address at
/// all — which is the normal state for a NAS on a home LAN.
///
/// What it must never be is EMPTY: an empty `sub` is not the same as an absent
/// one, and FCM rejects the token outright.
fn subject_of<S: HostCtx>(state: &S) -> String {
    public_url_of(state).unwrap_or_else(|| DEFAULT_SUBJECT.to_string())
}

/// The address this server answers on, when it has a public one.
///
/// The same `remoteUrl` the share and Quick Connect links are built from
/// (`settings::public_url`), read through the one accessor `HostCtx` offers.
/// `None` for a NAS with nothing but a LAN address, which is the normal case.
fn public_url_of<S: HostCtx>(state: &S) -> Option<String> {
    let public = state.setting_str("remoteUrl", "");
    let public = public.trim().trim_end_matches('/');
    let usable = public.starts_with("https://") || public.starts_with("http://");
    usable.then(|| public.to_string())
}

/// Everything a push needs that is per-SERVER rather than per-recipient: the
/// configured transports and their credentials.
///
/// Built once per emission by [`sender`]. Resolving it per recipient meant a
/// settings read and a key parse each time.
pub type Sender = transports::Senders;

/// The credential material the cached [`Keys`] were parsed from.
///
/// Kept only to be compared: a `.p8` pasted into the admin console must take
/// effect on the next push rather than after a restart, and equality on the raw
/// strings is the whole test for that.
#[derive(Clone, PartialEq, Eq)]
struct Credentials {
    vapid_private: String,
    apns_p8: String,
    apns_key_id: String,
    apns_team_id: String,
    apns_topic: String,
    fcm_service_account: String,
}

/// The parsed credentials, kept between emissions.
///
/// [`ApnsKey`] and [`FcmKey`] each cache a bearer token good for the better part
/// of an hour, and that cache lives INSIDE the key. Parsing them fresh per
/// emission therefore threw the cache away every time: every notification
/// re-signed Apple's JWT — which Apple rate-limits to one per 20 minutes per key
/// — and re-traded Google's assertion over the network, before a single
/// subscription had even been queried.
///
/// [`Sender`] is still assembled per emission on top of these, because the FCM
/// access token and the push subject are cheap to re-resolve and must be allowed
/// to change without a restart.
///
/// [`ApnsKey`]: kroma_push::apns::ApnsKey
/// [`FcmKey`]: kroma_push::fcm::FcmKey
#[derive(Default)]
struct Keys {
    web: Option<Arc<VapidKey>>,
    apns: Option<Arc<kroma_push::apns::ApnsKey>>,
    fcm: Option<Arc<kroma_push::fcm::FcmKey>>,
}

/// What the cache holds: the credentials last seen, and the keys parsed from
/// them.
type Cached = Mutex<Option<(Credentials, Arc<Keys>)>>;

/// One server per process, so a single slot is the whole cache.
static PARSED: OnceLock<Cached> = OnceLock::new();

/// What this server was configured with, read fresh so a settings change is
/// noticed. Cheap: these are settings reads and env lookups, no parsing.
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

/// The parsed keys for `credentials`, from cache when they have not changed.
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

/// Parse whatever is configured. Each transport is independent: an unusable
/// Apple key must not take Web Push down with it.
///
/// Nothing here is asked of the operator for APNs. The key, its id and the team
/// come as one bundle from whoever publishes the app, and the topic is a
/// constant because every KROMA server pushes to that same published app. The
/// environment is deliberately absent: it is a property of each device TOKEN,
/// not of the server (see [`transports::retry`]).
fn parse(credentials: &Credentials) -> Keys {
    let web = if credentials.vapid_private.is_empty() {
        None
    } else {
        match VapidKey::from_base64url(&credentials.vapid_private) {
            Ok(key) => Some(Arc::new(key)),
            Err(e) => {
                // A corrupted key would otherwise fail every push forever with
                // no clue why; say so loudly and let `public_key` mint a fresh
                // one.
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
            // Where the FIRST attempt goes. A production token is the
            // overwhelming majority — every App Store and TestFlight install —
            // so trying it first means the fallback costs a wasted request only
            // while developing.
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
///
/// Never `None`: the relay needs no credentials, so every server can reach a
/// phone even when it holds nothing of Apple's or Google's.
pub fn sender<S: HostCtx>(state: &S) -> Sender {
    let keys = keys_for(&credentials(state));
    transports::Senders {
        web: keys
            .web
            .clone()
            .map(|key| transports::WebPush { key, subject: subject_of(state) }),
        apns: keys.apns.clone().map(|key| transports::Apns { key }),
        // The token exchange is a network call, so it happens here, once per
        // emission, rather than per device — and now genuinely hits the key's
        // own cache instead of re-trading every time.
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

/// The cached OAuth2 token, or a fresh one traded for a signed assertion.
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

/// Send one rendered notification to every endpoint `user_id` has registered.
///
/// Returns how many endpoints accepted it. Called after the in-app row is
/// already written, so any failure here costs a push, never the notification.
pub fn deliver<S: HostCtx>(
    state: &S,
    sender: &Sender,
    user_id: &str,
    notification: &Notification,
) -> usize {
    // Scoped deliberately. Everything below this is blocking network I/O, and
    // the per-endpoint health bookkeeping takes connections of its own, so a
    // connection held across the sends pins a pool slot for the length of every
    // round trip and contends with the very pool it is about to ask again.
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

/// Send one "push is working" message to a user's own devices.
///
/// Lives here rather than in the api layer because composing a notification is
/// this service's job, and because the answer to "is my setup wired up?" should
/// exercise the very same path a real notification takes.
///
/// Deliberately bypasses the category preferences: the user just pressed the
/// button, so a muted category is not a reason to stay silent.
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

/// Deliver to one endpoint, updating its health. `Ok(false)` = not delivered but
/// handled (dropped as gone, or a transport this server has no credentials for).
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
        // The app was uninstalled, the browser unsubscribed, or the token was
        // rotated. Permanent: keeping it costs requests and gets us rate-limited.
        tracing::info!(
            endpoint = %sub.endpoint, status = response.status,
            "dropping dead push endpoint"
        );
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
        return Ok(false);
    }
    if is_transient(response.status) {
        // Not this endpoint's fault, so it earns no strike. See [`is_transient`].
        anyhow::bail!("push service is unavailable ({}): {body}", response.status)
    }
    if push_subs::record_failure(state.db(), &sub.id).unwrap_or(false) {
        tracing::info!(endpoint = %sub.endpoint, "dropping push endpoint after repeated failures");
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
    }
    anyhow::bail!("push service returned {} {body}", response.status)
}

/// Whether a rejection is the SERVICE's problem rather than this endpoint's.
///
/// The failure streak exists to evict endpoints that quietly stop working
/// without ever saying so — a token that is dead but answers 400, say. A 429 or
/// a 5xx says nothing about the endpoint: it says the service is busy or down,
/// and it will say the same thing to every device on this server at once.
///
/// Counting those was how one digest could unsubscribe a household. The relay
/// rate-limits per device (30 a minute), and `digest::run` announces every
/// followed show in one pass with no pacing, so a big scan earns 429s in bulk;
/// eight in a row hit [`MAX_FAILURES`] and the row is deleted. Nothing
/// re-registers it — the app only ever subscribes from the settings toggle, and
/// its grant refresh is a no-op while the grant it holds is still valid — so the
/// reader's push stays off until they notice and toggle it themselves.
///
/// [`kroma_push::relay::is_gone`] states this rule already; this is the half of
/// it the delivery loop owes.
///
/// [`MAX_FAILURES`]: kroma_db::push_subs::MAX_FAILURES
fn is_transient(status: u16) -> bool {
    // 408 for completeness: no transport sends it today, but a proxy in front of
    // one can, and it means the same thing.
    status == 408 || status == 429 || (500..600).contains(&status)
}

/// Perform one built request over the curl transport.
///
/// `http2` is not a preference: APNs refuses HTTP/1.1 outright, so a request
/// that asks for it must get it or the send is pointless.
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

/// What the service worker receives: the notification's own wire shape.
///
/// Serialized straight from [`Notification`] rather than rebuilt field-by-field,
/// so a push and the notification-centre row it mirrors cannot drift apart —
/// renaming a field in the domain now changes both at once instead of silently
/// desyncing this copy. `sw.js` reads the fields it needs and ignores the rest.
fn payload_of(n: &Notification) -> Vec<u8> {
    serde_json::to_vec(n).unwrap_or_else(|_| b"{}".to_vec())
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
        // Push services cap a message around 4 KiB; our own encoder caps at
        // MAX_PAYLOAD. A realistic notification must be nowhere near it.
        let raw = payload_of(&notification(NotificationCategory::Requests));
        assert!(raw.len() < kroma_push::webpush::MAX_PAYLOAD, "payload was {} bytes", raw.len());
    }

    #[test]
    fn the_subject_is_derived_and_never_empty() {
        // A server with no public address — the normal case for a NAS on a home
        // LAN — still needs a syntactically valid `sub`: an EMPTY one is not the
        // same as an absent one, and FCM rejects the token outright.
        let state = crate::test_support::test_state();
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);

        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("   "),
        )]));
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT, "whitespace is still no address");

        // Once the server knows where it answers, that IS the contact — nobody
        // has to be asked for one.
        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("https://kroma.example.com/"),
        )]));
        assert_eq!(subject_of(&state), "https://kroma.example.com", "trailing slash trimmed");

        // A bare hostname is not a valid `sub`, so it must not be passed through.
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

    /// Read and discard one HTTP request. `false` when the peer sent nothing.
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
        // 404/410 is permanent - the browser unsubscribed or the user cleared
        // site data. Keeping the row would mean pushing into the void forever.
        for gone in [404u16, 410] {
            let service = FakeService::answering(gone);
            let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, true);
            assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
            assert_eq!(subscription_count(&state, &user), 0, "{gone} should retire the endpoint");
        }
    }

    #[test]
    fn a_service_having_a_bad_night_never_costs_the_reader_their_registration() {
        // A 500 says the SERVICE is down, never that this device is gone - and it
        // says it to every device on the server at once. This used to earn a
        // strike, so an outage (or one digest outrunning the relay's 30-a-minute
        // rate limit) walked every endpoint to MAX_FAILURES and deleted it. The
        // reader would not come back until they re-granted permission by hand,
        // which is the outcome the streak exists to avoid, not to cause.
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
        // The one the relay actually produces: `digest::run` announces every
        // followed show in one pass, so a big scan earns 429s in bulk.
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
        // The streak still does its job: a 400 is about THIS request reaching
        // THIS endpoint, so an endpoint that answers it forever is dead in every
        // way except saying so, and keeping it costs a request per notification.
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
        // Otherwise a device that has been online for months would eventually
        // accumulate its way to being dropped.
        let failing = FakeService::answering(500);
        let (state, user) = state_with_endpoint(&failing.endpoint, PushTransport::WebPush, true);
        let note = notification(NotificationCategory::Requests);
        deliver(&state, &sender(&state), &user, &note);
        deliver(&state, &sender(&state), &user, &note);

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
        // APNs/FCM rows are stored but not deliverable yet. They must be skipped
        // rather than mangled through the Web Push encoding - and above all not
        // counted as failures, which would eventually delete the device.
        let service = FakeService::answering(201);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::Apns, true);
        assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(service.hits(), 0, "nothing should have been sent");
        assert_eq!(subscription_count(&state, &user), 1, "the device stays registered");
    }

    #[test]
    fn a_web_push_row_without_its_keys_fails_that_endpoint_only() {
        // Without p256dh/auth there is nothing to encrypt to. It is an error,
        // not a panic, and it must not take the whole delivery down.
        let service = FakeService::answering(201);
        let (state, user) = state_with_endpoint(&service.endpoint, PushTransport::WebPush, false);
        assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
        assert_eq!(service.hits(), 0);
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
            assert!(keys_for(&credentials(&state)).web.is_none(), "{broken:?} must not be usable");
            assert_eq!(deliver(&state, &sender(&state), &user, &notification(NotificationCategory::Requests)), 0);
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
        assert_eq!(
            keys_for(&credentials(&state)).web.as_ref().unwrap().public_base64url(),
            first
        );
    }
}
