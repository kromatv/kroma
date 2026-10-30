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

/// What became of one attempt to reach a device. `SkippedMuted` is the reader's
/// own preference, `Throttled` a group that pushed too recently, `Gone` an
/// endpoint the push service has retired.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryStatus {
    Sent,
    Failed,
    SkippedMuted,
    Throttled,
    Gone,
}

impl DeliveryStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            DeliveryStatus::Sent => "sent",
            DeliveryStatus::Failed => "failed",
            DeliveryStatus::SkippedMuted => "skipped_muted",
            DeliveryStatus::Throttled => "throttled",
            DeliveryStatus::Gone => "gone",
        }
    }

    pub fn parse(s: &str) -> Option<DeliveryStatus> {
        match s {
            "sent" => Some(DeliveryStatus::Sent),
            "failed" => Some(DeliveryStatus::Failed),
            "skipped_muted" => Some(DeliveryStatus::SkippedMuted),
            "throttled" => Some(DeliveryStatus::Throttled),
            "gone" => Some(DeliveryStatus::Gone),
            _ => None,
        }
    }
}

/// Whose device a delivery was for. Carried only by the admin's view; a reader
/// asking about their own devices already knows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryAccount {
    pub id: String,
    pub username: String,
}

/// One push attempt as a reader sees it.
///
/// It names the device and never its address: an endpoint, a device token and a
/// relay grant are all credentials, and none of them leaves the server. `device`
/// is the label the device chose for itself, `device_id` the subscription it was
/// sent to, which is what groups a run of attempts under one device.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationDelivery {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub transport: PushTransport,
    pub status: DeliveryStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<DeliveryAccount>,
    pub created_at: i64,
}

/// `GET /api/notifications/deliveries` and its admin counterpart.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveriesView {
    pub deliveries: Vec<NotificationDelivery>,
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

    #[test]
    fn a_delivery_status_round_trips_through_its_wire_string() {
        for s in [
            DeliveryStatus::Sent,
            DeliveryStatus::Failed,
            DeliveryStatus::SkippedMuted,
            DeliveryStatus::Throttled,
            DeliveryStatus::Gone,
        ] {
            assert_eq!(DeliveryStatus::parse(s.as_str()), Some(s));
            assert_eq!(
                serde_json::to_string(&s).unwrap(),
                format!("\"{}\"", s.as_str())
            );
        }
        assert_eq!(DeliveryStatus::parse("queued"), None);
    }
}
