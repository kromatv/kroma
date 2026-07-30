//! Web Push (RFC 8291 encryption + RFC 8292 VAPID request signing).
//!
//! The one push transport KROMA can offer with **no third party and no
//! account**: the server mints its own VAPID keypair, the browser subscribes
//! with the public half, and messages go straight to whatever push service that
//! browser uses. Nothing is registered anywhere, no secret is shared.

mod encrypt;
mod vapid;

use crate::{b64, PushRequest, Urgency};

use anyhow::{Context, Result};

pub use encrypt::MAX_PAYLOAD;
pub use vapid::VapidKey;

// Four weeks: a phone that was off all weekend should still learn its film
// arrived, and the notification is deduplicated by the in-app centre anyway.
const DEFAULT_TTL_SECS: u32 = 2_419_200;

/// One browser's push subscription, as the `PushSubscription` JSON gives it.
#[derive(Debug, Clone)]
pub struct Subscription {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// Encrypt `payload` for `subscription` and sign the request with `key`.
///
/// `subject` is the sender contact required by RFC 8292 (a `mailto:` or
/// `https:` URL). `now_secs` is the current unix time, passed in so the caller
/// owns the clock (and tests can pin it).
pub fn build_request(
    key: &VapidKey,
    subscription: &Subscription,
    payload: &[u8],
    subject: &str,
    urgency: Urgency,
    now_secs: i64,
) -> Result<PushRequest> {
    let p256dh = b64::decode(&subscription.p256dh).context("subscription p256dh")?;
    let auth = b64::decode(&subscription.auth).context("subscription auth")?;
    let body = encrypt::encrypt(payload, &p256dh, &auth)?;
    let authorization = key.authorization(&subscription.endpoint, subject, now_secs)?;

    Ok(PushRequest {
        url: subscription.endpoint.clone(),
        http2: false,
        headers: vec![
            ("Authorization".into(), authorization),
            // The body is a single aes128gcm record; the header block inside it
            // carries the salt and our key, so no `Crypto-Key` header (that was
            // the older aesgcm scheme).
            ("Content-Encoding".into(), "aes128gcm".into()),
            ("Content-Type".into(), "application/octet-stream".into()),
            ("TTL".into(), DEFAULT_TTL_SECS.to_string()),
            ("Urgency".into(), urgency.as_str().into()),
        ],
        body,
    })
}

/// Whether a push service's response means "this subscription is dead, stop
/// sending to it" as opposed to a transient failure worth retrying.
///
/// 404 = the endpoint never existed; 410 Gone = the browser unsubscribed or the
/// user cleared site data. Both are permanent, and a server that keeps pushing
/// to them gets rate-limited.
pub fn is_gone(status: u16) -> bool {
    status == 404 || status == 410
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subscription() -> Subscription {
        Subscription {
            endpoint: "https://push.example/wpush/v2/abc123".into(),
            p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4".into(),
            auth: "BTBZMqHH6r4Tts7J_aSIgg".into(),
        }
    }

    #[test]
    fn builds_a_complete_request_for_a_real_subscription() {
        let key = VapidKey::generate();
        let req =
            build_request(&key, &subscription(), b"hello", "mailto:a@b.c", Urgency::Normal, 1_700_000_000)
                .unwrap();

        assert_eq!(req.url, "https://push.example/wpush/v2/abc123");
        let header = |name: &str| {
            req.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str()).unwrap()
        };
        assert_eq!(header("Content-Encoding"), "aes128gcm");
        assert_eq!(header("Content-Type"), "application/octet-stream");
        assert_eq!(header("Urgency"), "normal");
        assert!(header("Authorization").starts_with("vapid t="));
        assert!(header("Authorization").contains(&key.public_base64url()));
        // Header block (21) + our public key (65) + payload + tag/delimiter.
        assert_eq!(req.body.len(), 21 + 65 + 5 + 17);
    }

    #[test]
    fn urgency_reaches_the_header() {
        let key = VapidKey::generate();
        for (urgency, expected) in
            [(Urgency::Low, "low"), (Urgency::Normal, "normal"), (Urgency::High, "high")]
        {
            let req =
                build_request(&key, &subscription(), b"x", "mailto:a@b.c", urgency, 0).unwrap();
            let value =
                req.headers.iter().find(|(k, _)| k == "Urgency").map(|(_, v)| v.clone()).unwrap();
            assert_eq!(value, expected);
        }
    }

    #[test]
    fn a_malformed_subscription_errors_instead_of_sending_garbage() {
        let key = VapidKey::generate();
        let mut sub = subscription();
        sub.p256dh = "not base64!!".into();
        let err = build_request(&key, &sub, b"x", "mailto:a@b.c", Urgency::Normal, 0).unwrap_err();
        assert!(format!("{err:#}").contains("p256dh"), "{err:#}");
    }

    #[test]
    fn gone_statuses_are_the_permanent_ones_only() {
        assert!(is_gone(404));
        assert!(is_gone(410));
        // Transient / retryable: a full queue, a rate limit, a service blip.
        for status in [201, 429, 500, 502, 503] {
            assert!(!is_gone(status), "{status} must not drop the subscription");
        }
    }
}
