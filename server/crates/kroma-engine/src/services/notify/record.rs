//! Writing down what became of a push attempt.
//!
//! Recording is best-effort in the same sense delivery is: a record that cannot
//! be written costs the record, never the push and never the notification.

use kroma_db::notification_deliveries::{record, NewDelivery};
use kroma_db::push_subs::PushSubscription;
use kroma_module_host::HostStorage;

use kroma_domain::DeliveryStatus;

use crate::services::auth::random_token;
use crate::services::jobs::now_ms;
use crate::services::scan::short_hash;

const MAX_ERROR: usize = 400;

const SHORTEST_ADDRESS: usize = 8;

fn bounded(error: String) -> String {
    match error.char_indices().nth(MAX_ERROR) {
        None => error,
        Some((at, _)) => format!("{}…", &error[..at]),
    }
}

fn without(text: String, address: &str) -> String {
    if address.len() < SHORTEST_ADDRESS || !text.contains(address) {
        return text;
    }
    text.replace(address, "…")
}

fn path_of(endpoint: &str) -> Option<&str> {
    let authority = endpoint.split_once("://")?.1;
    let at = authority.find('/')?;
    Some(&authority[at..])
}

/// The transport's own words, with any address it echoed taken out and the rest
/// cut to what a reader can use. `endpoint` is a URL for Web Push and the relay
/// and the device's own token for APNs and FCM, so both are taken out whole, and
/// a URL's path on its own with them.
fn readable(error: String, endpoint: &str) -> String {
    let said = without(error, endpoint);
    let said = match path_of(endpoint) {
        Some(path) => without(said, path),
        None => said,
    };
    bounded(said)
}

/// Write down one attempt against the device it was aimed at.
pub fn attempt<S: HostStorage>(
    state: &S,
    notification_id: &str,
    sub: &PushSubscription,
    status: DeliveryStatus,
    error: Option<String>,
) {
    let Ok(conn) = state.db().get() else {
        return;
    };
    let delivery = NewDelivery {
        id: short_hash(&format!("delivery|{}|{}", sub.user_id, random_token())),
        user_id: &sub.user_id,
        notification_id: Some(notification_id),
        subscription_id: Some(sub.id.as_str()),
        device: sub.device.as_deref(),
        transport: sub.transport,
        status,
        error: error.map(|said| readable(said, &sub.endpoint)),
        created_at: now_ms(),
    };
    if let Err(e) = record(&conn, &delivery) {
        tracing::debug!(error = %e, status = status.as_str(), "could not record a push attempt");
    }
}

/// Write down that a push was stopped before it was built, once per device that
/// would have received it: `SkippedMuted` for the reader's own preference,
/// `Throttled` for a folded row that pushed too recently. A reader with no device
/// registered leaves nothing: there was no push to explain.
pub fn withheld<S: HostStorage>(
    state: &S,
    user_id: &str,
    notification_id: &str,
    status: DeliveryStatus,
) {
    let subs = {
        let Ok(conn) = state.db().get() else {
            return;
        };
        kroma_db::push_subs::subscriptions_for_user(&conn, user_id).unwrap_or_default()
    };
    for sub in subs {
        attempt(state, notification_id, &sub, status, None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WEB_PUSH: &str = "https://push.example/wpush/v2/gAAAAABk7Qd3rL9";
    const DEVICE_TOKEN: &str = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

    #[test]
    fn an_error_longer_than_a_reader_can_use_is_cut() {
        let long = "x".repeat(MAX_ERROR + 50);

        let kept = readable(long, WEB_PUSH);

        assert_eq!(kept.chars().count(), MAX_ERROR + 1);
        assert!(kept.ends_with('…'));
    }

    #[test]
    fn an_error_that_fits_and_quotes_nothing_is_left_alone() {
        assert_eq!(readable("410 gone".into(), WEB_PUSH), "410 gone");
    }

    #[test]
    fn an_endpoint_a_service_quoted_back_is_taken_out() {
        let said = format!("POST {WEB_PUSH} returned 400");

        let kept = readable(said, WEB_PUSH);

        assert!(!kept.contains("gAAAAABk7Qd3rL9"), "{kept}");
        assert!(kept.starts_with("POST …"), "{kept}");
    }

    #[test]
    fn a_path_quoted_without_its_host_is_taken_out_too() {
        let said = "404 for /wpush/v2/gAAAAABk7Qd3rL9".to_string();

        let kept = readable(said, WEB_PUSH);

        assert_eq!(kept, "404 for …");
    }

    #[test]
    fn a_device_token_an_apple_or_google_error_echoed_is_taken_out() {
        let said = format!("BadDeviceToken for {DEVICE_TOKEN}");

        let kept = readable(said, DEVICE_TOKEN);

        assert_eq!(kept, "BadDeviceToken for …");
    }

    #[test]
    fn a_host_a_service_shares_with_every_device_is_not_an_address() {
        let said = "Could not resolve host: push.example".to_string();

        assert_eq!(readable(said.clone(), WEB_PUSH), said);
    }
}
