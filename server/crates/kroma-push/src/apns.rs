//! Apple Push Notification service. The server holds a `.p8` auth key, not a
//! certificate; each request carries a short-lived ES256 JWT signed with it.

use std::sync::Mutex;

use anyhow::{Context, Result};
use p256::pkcs8::DecodePrivateKey;
use p256::SecretKey;
use serde_json::json;

use crate::{jwt, PushRequest, Urgency};

// Apple allows one new token per 20 minutes and rejects one older than an
// hour; 45 minutes stays inside the expiry and outside the rate limit.
const TOKEN_LIFETIME_SECS: i64 = 45 * 60;

/// Which APNs host a device token belongs to. A development-build token only
/// exists in the sandbox; sending it to production returns `BadDeviceToken`,
/// which reads exactly like a dead device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Production,
    Sandbox,
}

impl Environment {
    fn host(self) -> &'static str {
        match self {
            Environment::Production => "https://api.push.apple.com",
            Environment::Sandbox => "https://api.sandbox.push.apple.com",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Environment::Production => "production",
            Environment::Sandbox => "sandbox",
        }
    }

    /// Anything unrecognised means production, so a typo cannot silently point
    /// a live server at the sandbox.
    pub fn parse(s: &str) -> Environment {
        match s.trim().to_ascii_lowercase().as_str() {
            "sandbox" | "development" | "dev" => Environment::Sandbox,
            _ => Environment::Production,
        }
    }
}

/// The server's APNs identity: the auth key plus who it belongs to.
pub struct ApnsKey {
    secret: SecretKey,
    key_id: String,
    team_id: String,
    topic: String,
    environment: Environment,
    cached: Mutex<Option<(String, i64)>>,
}

impl std::fmt::Debug for ApnsKey {
    // Never includes the key material: a `.p8` in a log or panic message is a
    // leaked Apple credential.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ApnsKey")
            .field("key_id", &self.key_id)
            .field("team_id", &self.team_id)
            .field("topic", &self.topic)
            .field("environment", &self.environment)
            .finish_non_exhaustive()
    }
}

impl ApnsKey {
    /// Build from the contents of a `.p8` file (PEM PKCS#8, as downloaded).
    pub fn new(
        p8_pem: &str,
        key_id: impl Into<String>,
        team_id: impl Into<String>,
        topic: impl Into<String>,
        environment: Environment,
    ) -> Result<Self> {
        let secret = SecretKey::from_pkcs8_pem(p8_pem.trim())
            .context("APNs auth key is not a PKCS#8 PEM private key (expected a .p8 file)")?;
        Ok(Self {
            secret,
            key_id: key_id.into(),
            team_id: team_id.into(),
            topic: topic.into(),
            environment,
            cached: Mutex::new(None),
        })
    }

    pub fn environment(&self) -> Environment {
        self.environment
    }

    fn token(&self, now_secs: i64) -> String {
        let mut cached = self.cached.lock().unwrap();
        if let Some((token, minted_at)) = cached.as_ref() {
            if now_secs - minted_at < TOKEN_LIFETIME_SECS {
                return token.clone();
            }
        }
        let token = jwt::sign_es256(
            &self.secret,
            &json!({ "alg": "ES256", "kid": self.key_id }),
            &json!({ "iss": self.team_id, "iat": now_secs }),
        );
        *cached = Some((token.clone(), now_secs));
        token
    }
}

pub use crate::Alert;

/// Build the request that delivers `alert` to one device token.
pub fn build_request(
    key: &ApnsKey,
    device_token: &str,
    alert: &Alert<'_>,
    urgency: Urgency,
    now_secs: i64,
) -> Result<PushRequest> {
    if device_token.trim().is_empty() {
        anyhow::bail!("APNs device token is empty");
    }
    let mut aps = json!({
        "alert": { "title": alert.title, "body": alert.body },
        "sound": "default",
        // Lets a Notification Service Extension fetch `imageUrl` and attach it.
        "mutable-content": 1,
    });
    if let Some(category) = alert.category {
        aps["category"] = json!(category);
    }
    if let Some(thread) = alert.thread_id {
        aps["thread-id"] = json!(thread);
    }

    let mut payload = json!({ "aps": aps, "id": alert.id });
    if let Some(link) = alert.link {
        payload["link"] = json!(link);
    }
    if let Some(image) = alert.image_url {
        payload["imageUrl"] = json!(image);
    }
    if !alert.actions.is_empty() {
        payload["actions"] = json!(alert
            .actions
            .iter()
            .map(|(id, method, href)| json!({ "id": id, "method": method, "href": href }))
            .collect::<Vec<_>>());
    }

    let headers = vec![
        ("authorization".into(), format!("bearer {}", key.token(now_secs))),
        ("apns-topic".into(), key.topic.clone()),
        ("apns-push-type".into(), "alert".into()),
        ("apns-priority".into(), urgency.apns_priority().to_string()),
        // Collapse a repeat of the same notification instead of stacking it.
        ("apns-collapse-id".into(), alert.id.chars().take(64).collect()),
        ("content-type".into(), "application/json".into()),
    ];

    Ok(PushRequest {
        url: format!("{}/3/device/{device_token}", key.environment.host()),
        headers,
        body: payload.to_string().into_bytes(),
        // Non-negotiable: APNs refuses HTTP/1.1.
        http2: true,
    })
}

/// Whether an APNs response means "this device token is dead, stop sending".
/// 410 always is; for 400, only `BadDeviceToken` / `DeviceTokenNotForTopic`
/// are — other 400s are our bug, not the device's, and must not evict it.
pub fn is_gone(status: u16, body: &str) -> bool {
    if status == 410 {
        return true;
    }
    if status != 400 {
        return false;
    }
    let reason = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("reason").and_then(|r| r.as_str()).map(str::to_string))
        .unwrap_or_default();
    matches!(reason.as_str(), "BadDeviceToken" | "DeviceTokenNotForTopic" | "Unregistered")
}

/// Whether a `BadDeviceToken` rejection is really a wrong-environment token,
/// not a dead device — [`is_gone`] would otherwise evict it. Retry via
/// [`flip_environment`] before believing it.
pub fn is_wrong_environment(status: u16, body: &str) -> bool {
    if status != 400 {
        return false;
    }
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("reason").and_then(|r| r.as_str()).map(str::to_string))
        .as_deref()
        == Some("BadDeviceToken")
}

/// Points an already-built request at the other APNs host; the JWT stays valid
/// since it signs only the key/team/topic, not the environment. Returns
/// `false` when the URL isn't ours.
pub fn flip_environment(request: &mut PushRequest) -> bool {
    let (from, to) = if request.url.starts_with(Environment::Production.host()) {
        (Environment::Production.host(), Environment::Sandbox.host())
    } else if request.url.starts_with(Environment::Sandbox.host()) {
        (Environment::Sandbox.host(), Environment::Production.host())
    } else {
        return false;
    };
    request.url = format!("{to}{}", &request.url[from.len()..]);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::b64;

    fn test_key(environment: Environment) -> ApnsKey {
        use p256::pkcs8::EncodePrivateKey;
        let pem = SecretKey::random(&mut rand_core::OsRng)
            .to_pkcs8_pem(Default::default())
            .unwrap()
            .to_string();
        ApnsKey::new(&pem, "ABC1234567", "TEAM123456", "tv.kroma.mobile", environment).unwrap()
    }

    fn alert<'a>() -> Alert<'a> {
        Alert {
            id: "n1",
            title: "Ready to watch",
            body: "Dune is now in your library.",
            link: Some("/movie/ab12"),
            image_url: Some("https://img/p.jpg"),
            category: Some("media_available"),
            thread_id: Some("requests"),
            actions: &ACTIONS,
        }
    }

    const ACTIONS: [(String, String, String); 0] = [];

    #[test]
    fn a_p8_that_is_not_a_key_is_rejected_with_a_useful_message() {
        let err = ApnsKey::new("not a key", "K", "T", "b", Environment::Production).unwrap_err();
        assert!(format!("{err:#}").contains(".p8"), "{err:#}");
    }

    #[test]
    fn the_url_names_the_device_and_the_right_host() {
        let req = build_request(&test_key(Environment::Production), "DEV1", &alert(), Urgency::High, 0)
            .unwrap();
        assert_eq!(req.url, "https://api.push.apple.com/3/device/DEV1");

        let sandbox =
            build_request(&test_key(Environment::Sandbox), "DEV1", &alert(), Urgency::High, 0).unwrap();
        assert_eq!(sandbox.url, "https://api.sandbox.push.apple.com/3/device/DEV1");
    }

    #[test]
    fn the_request_is_http2_and_carries_the_topic_and_bearer() {
        let key = test_key(Environment::Production);
        let req = build_request(&key, "DEV1", &alert(), Urgency::High, 1_700_000_000).unwrap();
        assert!(req.http2, "APNs refuses HTTP/1.1");
        let h = |n: &str| {
            req.headers.iter().find(|(k, _)| k == n).map(|(_, v)| v.clone()).unwrap()
        };
        assert_eq!(h("apns-topic"), "tv.kroma.mobile");
        assert_eq!(h("apns-push-type"), "alert");
        assert!(h("authorization").starts_with("bearer "));

        let token = h("authorization").trim_start_matches("bearer ").to_string();
        let parts: Vec<&str> = token.split('.').collect();
        let header: serde_json::Value =
            serde_json::from_slice(&b64::decode(parts[0]).unwrap()).unwrap();
        let claims: serde_json::Value =
            serde_json::from_slice(&b64::decode(parts[1]).unwrap()).unwrap();
        assert_eq!(header["alg"], "ES256");
        assert_eq!(header["kid"], "ABC1234567");
        assert_eq!(claims["iss"], "TEAM123456");
        assert_eq!(claims["iat"], 1_700_000_000);
    }

    #[test]
    fn the_payload_carries_the_alert_category_and_deep_link() {
        let req = build_request(&test_key(Environment::Production), "D", &alert(), Urgency::High, 0)
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        assert_eq!(body["aps"]["alert"]["title"], "Ready to watch");
        assert_eq!(body["aps"]["alert"]["body"], "Dune is now in your library.");
        // `category` is the registered action set — the only way APNs shows buttons.
        assert_eq!(body["aps"]["category"], "media_available");
        assert_eq!(body["aps"]["thread-id"], "requests");
        assert_eq!(body["aps"]["mutable-content"], 1);
        assert_eq!(body["link"], "/movie/ab12");
        assert_eq!(body["imageUrl"], "https://img/p.jpg");
        assert_eq!(body["id"], "n1");
    }

    #[test]
    fn optional_fields_are_omitted_rather_than_sent_null() {
        let bare = Alert { id: "n1", title: "T", body: "B", ..Default::default() };
        let req =
            build_request(&test_key(Environment::Production), "D", &bare, Urgency::Normal, 0).unwrap();
        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        assert!(body["aps"].get("category").is_none());
        assert!(body["aps"].get("thread-id").is_none());
        assert!(body.get("link").is_none());
        assert!(body.get("imageUrl").is_none());
    }

    #[test]
    fn urgency_maps_onto_apnss_two_priorities() {
        let key = test_key(Environment::Production);
        let priority = |u| {
            let req = build_request(&key, "D", &alert(), u, 0).unwrap();
            req.headers.iter().find(|(k, _)| k == "apns-priority").map(|(_, v)| v.clone()).unwrap()
        };
        assert_eq!(priority(Urgency::High), "10");
        assert_eq!(priority(Urgency::Normal), "10");
        // A digest must not wake a sleeping radio.
        assert_eq!(priority(Urgency::Low), "5");
    }

    #[test]
    fn the_bearer_token_is_reused_until_it_ages_out() {
        let key = test_key(Environment::Production);
        let token_at = |t| {
            let req = build_request(&key, "D", &alert(), Urgency::High, t).unwrap();
            req.headers.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.clone()).unwrap()
        };
        let first = token_at(1_000);
        assert_eq!(token_at(1_500), first);
        assert_eq!(token_at(1_000 + TOKEN_LIFETIME_SECS - 1), first);
        assert_ne!(token_at(1_000 + TOKEN_LIFETIME_SECS), first);
    }

    #[test]
    fn an_empty_device_token_is_refused_before_a_request_is_built() {
        let err = build_request(&test_key(Environment::Production), "  ", &alert(), Urgency::High, 0)
            .unwrap_err();
        assert!(err.to_string().contains("empty"), "{err}");
    }

    #[test]
    fn only_token_specific_failures_count_as_gone() {
        assert!(is_gone(410, ""));
        assert!(is_gone(400, r#"{"reason":"BadDeviceToken"}"#));
        assert!(is_gone(400, r#"{"reason":"DeviceTokenNotForTopic"}"#));

        assert!(!is_gone(400, r#"{"reason":"PayloadTooLarge"}"#));
        assert!(!is_gone(400, r#"{"reason":"BadTopic"}"#));
        assert!(!is_gone(400, r#"{"reason":"MissingTopic"}"#));
        assert!(!is_gone(403, r#"{"reason":"ExpiredProviderToken"}"#));
        assert!(!is_gone(429, ""));
        assert!(!is_gone(503, ""));
        // A 400 with an unreadable body is not a licence to drop the device.
        assert!(!is_gone(400, "not json"));
    }

    #[test]
    fn the_environment_setting_defaults_to_production() {
        assert_eq!(Environment::parse("sandbox"), Environment::Sandbox);
        assert_eq!(Environment::parse("Development"), Environment::Sandbox);
        assert_eq!(Environment::parse("production"), Environment::Production);
        // A typo must not silently point a real server at the sandbox.
        assert_eq!(Environment::parse("prod-uction"), Environment::Production);
        assert_eq!(Environment::parse(""), Environment::Production);
    }

    #[test]
    fn the_wrong_environment_is_told_apart_from_a_dead_device() {
        let bad_token = r#"{"reason":"BadDeviceToken"}"#;
        assert!(is_wrong_environment(400, bad_token));
        // `DeviceTokenNotForTopic` is a genuinely wrong app, not a wrong host.
        assert!(!is_wrong_environment(400, r#"{"reason":"DeviceTokenNotForTopic"}"#));
        assert!(!is_wrong_environment(400, r#"{"reason":"BadCollapseId"}"#));
        // A 410 is Apple's unambiguous "gone"; there is nothing to retry.
        assert!(!is_wrong_environment(410, bad_token));
        assert!(!is_wrong_environment(503, ""));
        // It stays a candidate for eviction if the retry fails too.
        assert!(is_gone(400, bad_token));
    }

    #[test]
    fn flipping_the_environment_moves_only_the_host() {
        let key = test_key(Environment::Production);
        let mut request = build_request(&key, "DEVICE-TOKEN", &alert(), Urgency::High, 0).unwrap();
        let headers = request.headers.clone();
        let body = request.body.clone();

        assert!(flip_environment(&mut request));
        assert_eq!(request.url, "https://api.sandbox.push.apple.com/3/device/DEVICE-TOKEN");
        assert_eq!(request.headers, headers, "a flip must not re-sign or re-header");
        assert_eq!(request.body, body);

        assert!(flip_environment(&mut request));
        assert_eq!(request.url, "https://api.push.apple.com/3/device/DEVICE-TOKEN");

        // A request that is not ours is left alone rather than mangled.
        let mut foreign = build_request(&key, "T", &alert(), Urgency::High, 0).unwrap();
        foreign.url = "https://fcm.googleapis.com/v1/x".into();
        assert!(!flip_environment(&mut foreign));
        assert_eq!(foreign.url, "https://fcm.googleapis.com/v1/x");
    }

    #[test]
    fn the_stored_environment_string_parses_back_to_the_same_environment() {
        assert_eq!(Environment::Production.as_str(), "production");
        assert_eq!(Environment::Sandbox.as_str(), "sandbox");
        assert_eq!(Environment::parse(Environment::Sandbox.as_str()), Environment::Sandbox);
        assert_eq!(Environment::parse(Environment::Production.as_str()), Environment::Production);

        let key = test_key(Environment::Sandbox);
        assert_eq!(key.environment(), Environment::Sandbox);
        assert_eq!(test_key(Environment::Production).environment(), Environment::Production);
    }

    #[test]
    fn debugging_a_key_never_prints_the_key_material() {
        let rendered = format!("{:?}", test_key(Environment::Sandbox));
        assert!(rendered.contains("ABC1234567"), "{rendered}");
        assert!(rendered.contains("TEAM123456"), "{rendered}");
        assert!(rendered.contains("tv.kroma.mobile"), "{rendered}");
        assert!(rendered.contains("Sandbox"), "{rendered}");
        assert!(!rendered.contains("secret"), "{rendered}");
        assert!(!rendered.contains("PRIVATE KEY"), "{rendered}");
    }

    #[test]
    fn actions_reach_the_device_as_an_id_method_and_href_each() {
        let actions = [
            ("approve".to_string(), "POST".to_string(), "/api/requests/r1/approve".to_string()),
            ("open".to_string(), "GET".to_string(), "/movie/ab12".to_string()),
        ];
        let alert = Alert { id: "n1", title: "T", body: "B", actions: &actions, ..Default::default() };
        let req =
            build_request(&test_key(Environment::Production), "D", &alert, Urgency::High, 0).unwrap();

        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        assert_eq!(body["actions"].as_array().unwrap().len(), 2);
        assert_eq!(body["actions"][0]["id"], "approve");
        assert_eq!(body["actions"][0]["method"], "POST");
        assert_eq!(body["actions"][0]["href"], "/api/requests/r1/approve");
        assert_eq!(body["actions"][1]["id"], "open");
    }
}
