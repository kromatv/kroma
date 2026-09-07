//! Push transports and subscriptions: how a notification reaches a device whose
//! app is closed.
//!
//! Split from [`crate::notifications`] because it is a distinct domain with a
//! distinct lifetime the notification centre works with no push configured at
//! all, and this half is what the native-mobile phase replaces. `kroma-db`
//! (`push_subs.rs`) and `services::notify` (`push.rs`) cut at the same seam.
//!
//! Pure data (serde), like the rest of this crate.

use serde::{Deserialize, Serialize};

pub use kroma_module_wire::{Audience, PushCategory};

/// How a push subscription reaches its device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushTransport {
    // Browser / installed PWA, RFC 8291. Fully self-hosted: the server signs
    // with its own VAPID key and posts straight to the browser's push endpoint.
    WebPush,
    // Raw APNs device token (iOS). Only usable by a server that holds the
    // published app's Apple credentials — which a self-hosted one cannot.
    Apns,
    // Raw FCM registration token (Android). Same restriction as `Apns`.
    Fcm,
    // A grant from the KROMA push relay, for iOS and Android alike: the normal
    // case for a self-hosted server. Apple and Google only accept credentials
    // issued to the account that publishes the app, so the app instead trades
    // its device token with the relay for a sealed grant registered here — a
    // capability to notify one device, not a token, and the server never learns
    // which device it is.
    Relay,
}

impl PushTransport {
    pub fn as_str(self) -> &'static str {
        match self {
            PushTransport::WebPush => "webpush",
            PushTransport::Apns => "apns",
            PushTransport::Fcm => "fcm",
            PushTransport::Relay => "relay",
        }
    }

    pub fn parse(s: &str) -> Option<PushTransport> {
        match s {
            "webpush" => Some(PushTransport::WebPush),
            "apns" => Some(PushTransport::Apns),
            "fcm" => Some(PushTransport::Fcm),
            "relay" => Some(PushTransport::Relay),
            _ => None,
        }
    }
}

/// `POST /api/push/subscribe`. Web Push sends `endpoint` + both keys; the native
/// clients send the device token as `endpoint` and omit the keys.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeBody {
    pub transport: PushTransport,
    pub endpoint: String,
    #[serde(default)]
    pub p256dh: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
    // Human label for the "your devices" list (e.g. "iPhone", "Firefox on Mac").
    #[serde(default)]
    pub device: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transports_and_push_categories_round_trip() {
        for t in [
            PushTransport::WebPush,
            PushTransport::Apns,
            PushTransport::Fcm,
            PushTransport::Relay,
        ] {
            assert_eq!(PushTransport::parse(t.as_str()), Some(t));
        }
        for c in [PushCategory::RequestReview, PushCategory::MediaAvailable] {
            assert_eq!(PushCategory::parse(c.as_str()), Some(c));
        }
        assert_eq!(PushTransport::parse("expo"), None);
        assert_eq!(PushCategory::parse("digest"), None);
    }
}
