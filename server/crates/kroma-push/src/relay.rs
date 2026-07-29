//! The KROMA push relay: how a self-hosted server reaches a phone.
//!
//! The other native transports in this crate assume the sender holds Apple's or
//! Google's credentials. A self-hosted KROMA server does not and cannot: those
//! belong to the account that publishes the app, and neither service will accept
//! a key issued to anybody else. Without a relay, `apns` and `fcm` are code that
//! only the publisher can run.
//!
//! So the server sends nothing to Apple or Google. It sends a GRANT — an opaque
//! capability the app obtained from the relay and registered here — plus the
//! notification, and the relay does the signing. What the server holds is not a
//! credential and not a device token; it is permission to notify one device,
//! useless for anything else and unreadable even to the server storing it.
//!
//! There is deliberately NO authentication on this request. The server's source
//! is public, so any shared secret shipped with it would be public too; the
//! grant is the whole authorisation. See `packages/push-relay/worker/grant.ts`.

use anyhow::Result;
use serde_json::json;

use crate::{PushRequest, Urgency};

/// Where grants are minted and spent. A constant rather than a setting: it is
/// the same address for every KROMA server, and an operator pointing their
/// notifications at an arbitrary host is a phishing route, not a feature.
pub const RELAY_URL: &str = "https://push.kroma.tv";

pub use crate::Alert;

/// Build the request that asks the relay to deliver `alert` to `grant`'s device.
pub fn build_request(grant: &str, alert: &Alert<'_>, urgency: Urgency) -> Result<PushRequest> {
    if grant.trim().is_empty() {
        anyhow::bail!("relay grant is empty");
    }

    let mut notification = json!({
        "id": alert.id,
        "title": alert.title,
        "body": alert.body,
        "urgency": urgency.as_str(),
    });
    if let Some(link) = alert.link {
        notification["link"] = json!(link);
    }
    if let Some(image) = alert.image_url {
        notification["imageUrl"] = json!(image);
    }
    if let Some(category) = alert.category {
        notification["category"] = json!(category);
    }
    if let Some(thread) = alert.thread_id {
        notification["threadId"] = json!(thread);
    }
    if !alert.actions.is_empty() {
        notification["actions"] = json!(alert
            .actions
            .iter()
            .map(|(id, method, href)| json!({ "id": id, "method": method, "href": href }))
            .collect::<Vec<_>>());
    }

    Ok(PushRequest {
        url: format!("{RELAY_URL}/v1/push"),
        headers: vec![("content-type".into(), "application/json".into())],
        body: json!({ "grant": grant, "notification": notification }).to_string().into_bytes(),
        http2: false,
    })
}

/// Whether a relay response means this grant will never work again.
///
/// The relay speaks the same 410 that Apple and Google do when a device is gone,
/// so eviction reads identically whichever transport a row uses. A 401 joins it:
/// the grant expired or the relay rotated its sealing key, and no amount of
/// retrying will revive it — the app must register a fresh one.
///
/// Everything else — 429, 502, 503 — is transient and must NOT cost the reader
/// their registration.
pub fn is_gone(status: u16) -> bool {
    matches!(status, 410 | 401)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NO_ACTIONS: [(String, String, String); 0] = [];

    fn alert<'a>() -> Alert<'a> {
        Alert {
            id: "n1",
            title: "Ready to watch",
            body: "Dune is now in your library.",
            link: Some("/movie/ab12"),
            image_url: Some("https://img/p.jpg"),
            category: Some("media_available"),
            thread_id: Some("requests"),
            actions: &NO_ACTIONS,
        }
    }

    fn body_of(request: &PushRequest) -> serde_json::Value {
        serde_json::from_slice(&request.body).unwrap()
    }

    #[test]
    fn the_request_carries_the_grant_and_the_structure() {
        let request = build_request("v1.SEALED", &alert(), Urgency::High).unwrap();
        assert_eq!(request.url, "https://push.kroma.tv/v1/push");

        let body = body_of(&request);
        assert_eq!(body["grant"], "v1.SEALED");
        assert_eq!(body["notification"]["title"], "Ready to watch");
        assert_eq!(body["notification"]["link"], "/movie/ab12");
        assert_eq!(body["notification"]["imageUrl"], "https://img/p.jpg");
        assert_eq!(body["notification"]["category"], "media_available");
        assert_eq!(body["notification"]["threadId"], "requests");
        assert_eq!(body["notification"]["urgency"], "high");
    }

    #[test]
    fn no_device_token_and_no_credential_ever_leave_the_server() {
        // The whole point: this request contains a capability and a message, and
        // nothing that could reach Apple or Google on its own.
        let request = build_request("v1.SEALED", &alert(), Urgency::High).unwrap();
        let wire = String::from_utf8(request.body.clone()).unwrap();
        assert!(!wire.contains("apns-topic"));
        assert!(!wire.contains("BEGIN PRIVATE KEY"));
        // …and no bearer token is attached, because there is nothing to prove.
        assert!(!request.headers.iter().any(|(name, _)| name.eq_ignore_ascii_case("authorization")));
    }

    #[test]
    fn optional_fields_are_omitted_rather_than_sent_null() {
        let bare = Alert {
            id: "n1",
            title: "Hello",
            body: "",
            link: None,
            image_url: None,
            category: None,
            thread_id: None,
            actions: &NO_ACTIONS,
        };
        let body = body_of(&build_request("v1.SEALED", &bare, Urgency::Low).unwrap());
        let notification = &body["notification"];
        for absent in ["link", "imageUrl", "category", "threadId", "actions"] {
            assert!(notification.get(absent).is_none(), "{absent} should be omitted");
        }
        assert_eq!(notification["urgency"], "low");
    }

    #[test]
    fn actions_travel_as_objects() {
        let actions = [("approve".to_string(), "POST".to_string(), "/api/r1/approve".to_string())];
        let with = Alert { actions: &actions, ..alert() };
        let body = body_of(&build_request("v1.SEALED", &with, Urgency::High).unwrap());
        assert_eq!(body["notification"]["actions"][0]["id"], "approve");
        assert_eq!(body["notification"]["actions"][0]["method"], "POST");
        assert_eq!(body["notification"]["actions"][0]["href"], "/api/r1/approve");
    }

    #[test]
    fn an_empty_grant_is_refused_rather_than_sent() {
        assert!(build_request("   ", &alert(), Urgency::High).is_err());
    }

    #[test]
    fn only_the_permanent_statuses_evict() {
        // 410: the device is gone. 401: the grant is expired or was sealed with
        // a key the relay no longer holds.
        assert!(is_gone(410));
        assert!(is_gone(401));
        // A busy or broken relay must never cost someone their registration.
        for transient in [429, 500, 502, 503, 504, 400] {
            assert!(!is_gone(transient), "{transient} should not evict");
        }
    }
}
