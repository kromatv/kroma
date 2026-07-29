//! Firebase Cloud Messaging (HTTP v1).
//!
//! Android's only path. Unlike APNs, FCM v1 is not signed per request: the
//! server signs a short-lived assertion with its service-account key, trades it
//! for an OAuth2 access token, and then bearers that token on every send. The
//! trade is a network round trip, so the token is cached until it nears expiry
//! and this module hands the caller BOTH steps as plain requests, keeping the
//! crate I/O-free like its neighbours.
//!
//! The legacy `key=AAAA…` server key is deliberately not supported: Google
//! turned it off in 2024, and a server built on it would work in testing against
//! nothing.

use std::sync::Mutex;

use anyhow::{Context, Result};
use rsa::pkcs8::DecodePrivateKey;
use rsa::RsaPrivateKey;
use serde::Deserialize;
use serde_json::json;

use crate::{jwt, PushRequest, Urgency};

/// Refresh this long before the token actually expires, so a send never races
/// the boundary and gets a 401 it would have to retry.
const REFRESH_MARGIN_SECS: i64 = 5 * 60;

/// The scope FCM sends require.
const SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

/// The fields KROMA needs from a downloaded service-account JSON.
#[derive(Debug, Deserialize)]
struct ServiceAccount {
    project_id: String,
    client_email: String,
    private_key: String,
    #[serde(default = "default_token_uri")]
    token_uri: String,
}

fn default_token_uri() -> String {
    TOKEN_URL.to_string()
}

/// The server's FCM identity, parsed from the service-account JSON an operator
/// pastes into the admin settings.
pub struct FcmKey {
    project_id: String,
    client_email: String,
    token_uri: String,
    private_key: RsaPrivateKey,
    /// The current access token and the unix time it stops being usable.
    cached: Mutex<Option<(String, i64)>>,
}

impl std::fmt::Debug for FcmKey {
    /// The project it targets, never the private key.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FcmKey")
            .field("project_id", &self.project_id)
            .field("client_email", &self.client_email)
            .finish_non_exhaustive()
    }
}

impl FcmKey {
    /// Parse a service-account JSON file's contents.
    pub fn new(service_account_json: &str) -> Result<Self> {
        let account: ServiceAccount = serde_json::from_str(service_account_json)
            .context("FCM credentials are not a service-account JSON")?;
        // The JSON embeds the PEM with escaped newlines; serde has already
        // unescaped them, but a hand-pasted value may still carry literal `\n`.
        let pem = account.private_key.replace("\\n", "\n");
        let private_key = RsaPrivateKey::from_pkcs8_pem(pem.trim())
            .context("service-account private_key is not a PKCS#8 PEM RSA key")?;
        Ok(Self {
            project_id: account.project_id,
            client_email: account.client_email,
            token_uri: account.token_uri,
            private_key,
            cached: Mutex::new(None),
        })
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    /// The cached access token, if one is still comfortably valid.
    pub fn cached_token(&self, now_secs: i64) -> Option<String> {
        let cached = self.cached.lock().unwrap();
        cached
            .as_ref()
            .filter(|(_, expires_at)| now_secs + REFRESH_MARGIN_SECS < *expires_at)
            .map(|(token, _)| token.clone())
    }

    /// The request that trades a signed assertion for an access token. The
    /// caller performs it and feeds the reply to [`Self::store_token`].
    pub fn token_request(&self, now_secs: i64) -> Result<PushRequest> {
        let assertion = jwt::sign_rs256(
            &self.private_key,
            &json!({ "alg": "RS256", "typ": "JWT" }),
            &json!({
                "iss": self.client_email,
                "scope": SCOPE,
                "aud": self.token_uri,
                "iat": now_secs,
                // Google caps the assertion at an hour.
                "exp": now_secs + 3600,
            }),
        )?;
        let form = format!(
            "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={assertion}"
        );
        Ok(PushRequest {
            url: self.token_uri.clone(),
            headers: vec![(
                "content-type".into(),
                "application/x-www-form-urlencoded".into(),
            )],
            body: form.into_bytes(),
            http2: false,
        })
    }

    /// Record the token from a successful [`Self::token_request`] reply.
    pub fn store_token(&self, response_body: &str, now_secs: i64) -> Result<String> {
        #[derive(Deserialize)]
        struct TokenReply {
            access_token: String,
            #[serde(default)]
            expires_in: i64,
        }
        let reply: TokenReply =
            serde_json::from_str(response_body).context("FCM token reply is not JSON")?;
        // Google returns 3600; treat a missing/odd value as one minute so a
        // broken reply refreshes promptly rather than pinning a stale token.
        let ttl = if reply.expires_in > 0 { reply.expires_in } else { 60 };
        *self.cached.lock().unwrap() = Some((reply.access_token.clone(), now_secs + ttl));
        Ok(reply.access_token)
    }
}

pub use crate::Alert;

/// Build the send request for one device token. `access_token` comes from
/// [`FcmKey::cached_token`] or a fresh [`FcmKey::token_request`].
pub fn build_request(
    key: &FcmKey,
    access_token: &str,
    device_token: &str,
    alert: &Alert<'_>,
    urgency: Urgency,
) -> Result<PushRequest> {
    if device_token.trim().is_empty() {
        anyhow::bail!("FCM device token is empty");
    }
    let mut notification = json!({ "title": alert.title, "body": alert.body });
    if let Some(image) = alert.image_url {
        notification["image"] = json!(image);
    }

    // Everything the app needs on tap rides in `data`, which survives both the
    // foreground and background paths; `notification` only drives what the
    // system shade draws.
    let mut data = json!({ "id": alert.id });
    if let Some(link) = alert.link {
        data["link"] = json!(link);
    }
    if let Some(category) = alert.category {
        data["category"] = json!(category);
    }
    if !alert.actions.is_empty() {
        // Every `data` value must be a string on FCM, so the list travels as
        // encoded JSON and the app parses it back.
        data["actions"] = json!(serde_json::to_string(
            &alert
                .actions
                .iter()
                .map(|(id, method, href)| json!({ "id": id, "method": method, "href": href }))
                .collect::<Vec<_>>()
        )
        .unwrap_or_else(|_| "[]".into()));
    }

    let android = json!({
        "priority": match urgency {
            Urgency::Low => "normal",
            Urgency::Normal | Urgency::High => "high",
        },
        "notification": {
            // Android 8+ requires a channel; the app creates one per category.
            "channel_id": alert.category.unwrap_or("default"),
            // No `click_action`: it names an intent action an activity must
            // declare an <intent-filter> for, and the app declares none - so a
            // tap resolved to nothing at all. Absent, Firebase builds the content
            // intent from the launcher activity, which is what opens the app and
            // lets `expo-notifications` hand the tap to the router.
        },
    });
    // Deliberately NOT mapped onto Android's `tag` or `collapse_key`, though the
    // names invite it. `thread_id` means "group these together", which is what it
    // does on Apple; on Android `tag` REPLACES the shade entry and `collapse_key`
    // tells FCM to store-and-forward only the most recent - so a season drop of
    // four episodes showed one row, and a phone that was offline received one
    // notification instead of four. Grouping on Android is the client's job (a
    // group key on the channel), not something the payload can ask for.

    let message = json!({
        "message": {
            "token": device_token,
            "notification": notification,
            "data": data,
            "android": android,
        }
    });

    Ok(PushRequest {
        url: format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            key.project_id
        ),
        headers: vec![
            ("authorization".into(), format!("Bearer {access_token}")),
            ("content-type".into(), "application/json".into()),
        ],
        body: message.to_string().into_bytes(),
        http2: false,
    })
}

/// Whether an FCM response means "this registration token is dead".
///
/// 404 `UNREGISTERED` is the app being uninstalled or the token rotated. A 400
/// is only terminal when FCM names the token as the invalid argument; a 400
/// about the payload is our bug and must not evict the device.
pub fn is_gone(status: u16, body: &str) -> bool {
    if status == 404 {
        return true;
    }
    if status != 400 {
        return false;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    // The v1 API reports the specific cause in error.details[].errorCode.
    let unregistered = value["error"]["details"]
        .as_array()
        .map(|details| {
            details.iter().any(|d| {
                matches!(
                    d.get("errorCode").and_then(|c| c.as_str()),
                    Some("UNREGISTERED" | "INVALID_ARGUMENT")
                )
            })
        })
        .unwrap_or(false);
    // …but only when the complaint is actually about the token field.
    unregistered
        && value["error"]["message"]
            .as_str()
            .is_some_and(|m| m.to_ascii_lowercase().contains("token"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs8::EncodePrivateKey;

    fn service_account_json() -> String {
        let key = RsaPrivateKey::new(&mut rand_core::OsRng, 2048).unwrap();
        let pem = key.to_pkcs8_pem(Default::default()).unwrap().to_string();
        json!({
            "type": "service_account",
            "project_id": "kroma-test",
            "client_email": "push@kroma-test.iam.gserviceaccount.com",
            "private_key": pem,
        })
        .to_string()
    }

    fn key() -> FcmKey {
        FcmKey::new(&service_account_json()).unwrap()
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

    /// One `api` action, the shape a moderator's Approve button carries.
    const ACTIONS: [(String, String, String); 0] = [];

    #[test]
    fn credentials_that_are_not_a_service_account_are_rejected() {
        assert!(FcmKey::new("{}").is_err());
        let err = FcmKey::new(r#"{"project_id":"p","client_email":"e","private_key":"nope"}"#)
            .unwrap_err();
        assert!(format!("{err:#}").contains("PKCS#8"), "{err:#}");
    }

    #[test]
    fn the_token_request_is_a_signed_jwt_bearer_grant() {
        let key = key();
        let req = key.token_request(1_700_000_000).unwrap();
        assert_eq!(req.url, TOKEN_URL);
        let body = String::from_utf8(req.body).unwrap();
        assert!(body.starts_with("grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer"));

        let assertion = body.split("assertion=").nth(1).unwrap();
        let claims: serde_json::Value = serde_json::from_slice(
            &crate::b64::decode(assertion.split('.').nth(1).unwrap()).unwrap(),
        )
        .unwrap();
        assert_eq!(claims["iss"], "push@kroma-test.iam.gserviceaccount.com");
        assert_eq!(claims["scope"], SCOPE);
        assert_eq!(claims["exp"], 1_700_000_000 + 3600);
    }

    #[test]
    fn a_stored_token_is_reused_then_refreshed_before_it_expires() {
        let key = key();
        assert!(key.cached_token(1_000).is_none(), "nothing cached yet");

        key.store_token(r#"{"access_token":"ya29.abc","expires_in":3600}"#, 1_000).unwrap();
        assert_eq!(key.cached_token(1_000).as_deref(), Some("ya29.abc"));
        // Still good well inside the window.
        assert_eq!(key.cached_token(3_000).as_deref(), Some("ya29.abc"));
        // Inside the refresh margin it is treated as spent, so a send never
        // races the expiry and eats a 401.
        assert!(key.cached_token(1_000 + 3600 - REFRESH_MARGIN_SECS).is_none());
    }

    #[test]
    fn a_token_reply_without_an_expiry_is_treated_as_short_lived() {
        let key = key();
        key.store_token(r#"{"access_token":"t"}"#, 1_000).unwrap();
        // Not pinned forever: a broken reply refreshes almost immediately.
        assert!(key.cached_token(1_000).is_none());
    }

    #[test]
    fn the_message_targets_the_project_and_the_device() {
        let key = key();
        let req = build_request(&key, "ya29.tok", "DEV1", &alert(), Urgency::High).unwrap();
        assert_eq!(req.url, "https://fcm.googleapis.com/v1/projects/kroma-test/messages:send");
        let auth =
            req.headers.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.clone()).unwrap();
        assert_eq!(auth, "Bearer ya29.tok");

        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        assert_eq!(body["message"]["token"], "DEV1");
        assert_eq!(body["message"]["notification"]["title"], "Ready to watch");
        assert_eq!(body["message"]["notification"]["image"], "https://img/p.jpg");
        // The tap payload rides in `data`, which survives background delivery.
        assert_eq!(body["message"]["data"]["link"], "/movie/ab12");
        assert_eq!(body["message"]["data"]["id"], "n1");
        assert_eq!(body["message"]["data"]["category"], "media_available");
        // Android 8+ refuses a notification with no channel.
        assert_eq!(body["message"]["android"]["notification"]["channel_id"], "media_available");
    }

    #[test]
    fn urgency_maps_onto_androids_two_priorities() {
        let key = key();
        let priority = |u| {
            let req = build_request(&key, "t", "D", &alert(), u).unwrap();
            let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
            body["message"]["android"]["priority"].as_str().unwrap().to_string()
        };
        assert_eq!(priority(Urgency::High), "high");
        assert_eq!(priority(Urgency::Low), "normal");
    }

    #[test]
    fn a_bare_alert_omits_the_optional_fields_and_uses_the_default_channel() {
        let key = key();
        let bare = Alert { id: "n1", title: "T", body: "B", ..Default::default() };
        let req = build_request(&key, "t", "D", &bare, Urgency::Normal).unwrap();
        let body: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
        assert!(body["message"]["notification"].get("image").is_none());
        assert!(body["message"]["data"].get("link").is_none());
        assert_eq!(body["message"]["android"]["notification"]["channel_id"], "default");
    }

    #[test]
    fn an_empty_device_token_is_refused() {
        let key = key();
        assert!(build_request(&key, "t", "", &alert(), Urgency::High).is_err());
    }

    #[test]
    fn only_token_specific_failures_count_as_gone() {
        assert!(is_gone(404, ""));
        assert!(is_gone(
            400,
            r#"{"error":{"message":"The registration token is not a valid FCM registration token","details":[{"errorCode":"INVALID_ARGUMENT"}]}}"#
        ));

        // A payload complaint is our bug: evicting on it would wipe every device.
        assert!(!is_gone(
            400,
            r#"{"error":{"message":"Invalid JSON payload","details":[{"errorCode":"INVALID_ARGUMENT"}]}}"#
        ));
        assert!(!is_gone(401, ""));
        assert!(!is_gone(429, ""));
        assert!(!is_gone(503, ""));
        assert!(!is_gone(400, "not json"));
    }
}
