//! Push delivery: getting a notification onto a device whose app is closed.
//! Three transports, one delivery loop. Delivery is best-effort: a push that
//! fails leaves the in-app notification exactly where it was.

mod credentials;
mod deliver;
mod transports;

#[cfg(test)]
mod test_support;

pub use credentials::{public_key, sender};
pub use deliver::{deliver, send_test};

use kroma_module_host::HostStorage;
use kroma_push::Urgency;

use kroma_domain::Notification;

use crate::db;

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

// The RFC 8292 `sub` claim. Must be a `mailto:` or `https:` URL and must never
// be empty — an empty `sub` is not an absent one, and FCM rejects the token.
fn subject_of<S: HostStorage>(state: &S) -> String {
    public_url_of(state).unwrap_or_else(|| DEFAULT_SUBJECT.to_string())
}

fn public_url_of<S: HostStorage>(state: &S) -> Option<String> {
    let public = state.setting_str("remoteUrl", "");
    let public = public.trim().trim_end_matches('/');
    let usable = public.starts_with("https://") || public.starts_with("http://");
    usable.then(|| public.to_string())
}

/// The configured transports and their credentials, built once per emission.
pub type Sender = transports::Senders;

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

pub fn is_subscribed<S: HostStorage>(state: &S, user_id: &str) -> bool {
    let Ok(conn) = state.db().get() else {
        return false;
    };
    db::push_subs::has_subscription(&conn, user_id).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use kroma_module_host::HostCtx;
    use serde_json::json;

    use super::test_support::notification;
    use super::*;
    use kroma_domain::NotificationCategory;

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
        assert!(
            raw.len() < kroma_push::webpush::MAX_PAYLOAD,
            "payload was {} bytes",
            raw.len()
        );
    }

    #[test]
    fn the_subject_is_derived_and_never_empty() {
        let state = crate::test_support::test_state();
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);

        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("   "),
        )]));
        assert_eq!(
            subject_of(&state),
            DEFAULT_SUBJECT,
            "whitespace is still no address"
        );

        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("https://kroma.example.com/"),
        )]));
        assert_eq!(
            subject_of(&state),
            "https://kroma.example.com",
            "trailing slash trimmed"
        );

        // A bare hostname is not a valid `sub`.
        state.set_settings(std::collections::BTreeMap::from([(
            "remoteUrl".to_string(),
            json!("kroma.example.com"),
        )]));
        assert_eq!(subject_of(&state), DEFAULT_SUBJECT);
    }

    #[test]
    fn urgency_follows_how_much_the_user_is_waiting() {
        assert_eq!(
            urgency_of(&notification(NotificationCategory::Requests)),
            Urgency::High
        );
        assert_eq!(
            urgency_of(&notification(NotificationCategory::Reports)),
            Urgency::High
        );
        assert_eq!(
            urgency_of(&notification(NotificationCategory::Downloads)),
            Urgency::Normal
        );
        assert_eq!(
            urgency_of(&notification(NotificationCategory::Media)),
            Urgency::Low
        );
    }
}
