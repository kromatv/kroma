//! The per-transport half of a push.
//!
//! Each service answers only three questions the shared delivery loop cannot:
//! how to build a request for THIS device, which failures deserve one adjusted
//! retry, and which mean the device is permanently gone. The loop in the parent
//! module owns the rest, so adding a transport never touches the shared health
//! bookkeeping.
//!
//! "Gone" is deliberately narrow and per-transport: each service also has 400s
//! that mean *we* sent something wrong, and treating those as the device's fault
//! would evict every registered device the first time a payload was mis-set.

use std::sync::Arc;

use anyhow::Result;
use kroma_db::push_subs::PushSubscription;
use kroma_push::{apns, fcm, relay, webpush, PushRequest, Urgency};

use kroma_domain::Notification;

/// The configured senders. `apns` and `fcm` are `None` until this build is given
/// the published app's credentials, so an unconfigured transport costs nothing
/// at send time.
///
/// `relay` has no `Option`: it needs no credentials by design, which is the
/// whole reason it exists. A self-hosted server can always spend a grant.
#[derive(Default)]
pub struct Senders {
    pub web: Option<WebPush>,
    pub apns: Option<Apns>,
    pub fcm: Option<Fcm>,
}

impl Senders {
    /// Whether this server holds credentials of its own, and so can reach Apple
    /// or Google without the relay.
    ///
    /// Not a precondition for sending — the relay covers every server, including
    /// the ones this returns `false` for. It answers the admin console's "what
    /// is this build capable of on its own".
    pub fn has_own_credentials(&self) -> bool {
        self.apns.is_some() || self.fcm.is_some()
    }
}

/// Self-hosted Web Push: the server's own VAPID identity.
pub struct WebPush {
    pub key: Arc<VapidKey>,
    pub subject: String,
}

pub use kroma_push::webpush::VapidKey;

/// Apple, via a `.p8` auth key.
pub struct Apns {
    pub key: Arc<apns::ApnsKey>,
}

/// Google, via a service account. `access_token` is the OAuth2 token, fetched
/// lazily and cached inside [`fcm::FcmKey`].
pub struct Fcm {
    pub key: Arc<fcm::FcmKey>,
    pub access_token: String,
}

/// The pieces of a notification every transport needs, extracted once.
pub struct Outgoing<'a> {
    pub notification: &'a Notification,
    // The Web Push body (the notification's own JSON), already serialized.
    pub web_payload: &'a [u8],
    pub urgency: Urgency,
    // The notification's `api` actions as `(id, method, href)` for native
    // payloads; a `link` action is just navigation, covered by the tap handler.
    pub actions: Vec<(String, String, String)>,
    // Deliberately not `notification.image_url`: that's server-relative, right for
    // Web Push but useless to Apple/Google who fetch from the device. `None` when
    // there is no reachable URL to name.
    pub native_image: Option<String>,
}

/// Flatten a notification's actionable buttons for the native payloads.
pub fn native_actions(n: &Notification) -> Vec<(String, String, String)> {
    n.actions
        .iter()
        .filter(|a| a.kind == kroma_domain::ActionKind::Api)
        .map(|a| {
            (
                a.id.clone(),
                a.method.clone().unwrap_or_else(|| "POST".into()),
                a.href.clone(),
            )
        })
        .collect()
}

/// Build the request that delivers `out` to `sub`, or `None` when this
/// subscription's transport is not configured on this server.
pub fn build(
    senders: &Senders,
    sub: &PushSubscription,
    out: &Outgoing<'_>,
    now_secs: i64,
) -> Result<Option<PushRequest>> {
    use kroma_domain::PushTransport as T;
    // One alert for every native transport: they read the same shape, so
    // building it per arm only created three places for a field to be forgotten.
    let alert = alert(out);
    match sub.transport {
        T::WebPush => {
            let Some(web) = senders.web.as_ref() else {
                return Ok(None);
            };
            let (Some(p256dh), Some(auth)) = (sub.p256dh.clone(), sub.auth.clone()) else {
                anyhow::bail!("web push subscription {} is missing its keys", sub.id);
            };
            let subscription = webpush::Subscription {
                endpoint: sub.endpoint.clone(),
                p256dh,
                auth,
            };
            webpush::build_request(
                &web.key,
                &subscription,
                out.web_payload,
                &web.subject,
                out.urgency,
                now_secs,
            )
            .map(Some)
        }
        T::Apns => {
            let Some(apns) = senders.apns.as_ref() else {
                return Ok(None);
            };
            apns::build_request(&apns.key, &sub.endpoint, &alert, out.urgency, now_secs).map(Some)
        }
        T::Fcm => {
            let Some(google) = senders.fcm.as_ref() else {
                return Ok(None);
            };
            fcm::build_request(
                &google.key,
                &google.access_token,
                &sub.endpoint,
                &alert,
                out.urgency,
            )
            .map(Some)
        }
        // No `let Some(..) else` here: the relay needs no credentials, so unlike
        // the two above it can never be "not configured on this server".
        //
        // `sub.endpoint` is a grant, not a device token — the server has never
        // seen the token this will reach.
        T::Relay => relay::build_request(&sub.endpoint, &alert, out.urgency).map(Some),
    }
}

// The transport-facing view of a notification.
fn alert<'a>(out: &'a Outgoing<'a>) -> kroma_push::Alert<'a> {
    let n = out.notification;
    kroma_push::Alert {
        id: &n.id,
        title: &n.title,
        body: &n.body,
        link: n.link.as_deref(),
        image_url: out.native_image.as_deref(),
        category: push_category(n),
        // Group by category so a run of "new episode" notifications collapses
        // into one thread in the shade instead of a wall of separate rows.
        thread_id: Some(n.category.as_str()),
        actions: &out.actions,
    }
}

// Makes `push_category` useful: APNs/Android can't carry arbitrary buttons,
// only the name of a set registered at launch, so the client supplies them.
fn push_category(n: &Notification) -> Option<&'static str> {
    n.push_category.map(kroma_domain::PushCategory::as_str)
}

/// Whether this failure is worth one immediate second attempt, having adjusted
/// `request` so the retry differs from what just failed.
///
/// Only APNs needs this today, but keeping it on this seam (rather than another
/// `if sub.transport == …` in delivery) is what stops the next case — a stale
/// FCM token, a rotated relay key — from scattering transport checks everywhere.
pub fn retry(sub: &PushSubscription, request: &mut PushRequest, status: u16, body: &str) -> bool {
    use kroma_domain::PushTransport as T;
    match sub.transport {
        // Which APNs host a token belongs to is a fact about the DEVICE, not a
        // server setting — one server can hold both a TestFlight and an Xcode
        // token at once, so discover it from the unambiguous rejection instead.
        T::Apns => apns::is_wrong_environment(status, body) && apns::flip_environment(request),
        T::WebPush | T::Fcm | T::Relay => false,
    }
}

/// Whether a response means this device is permanently gone.
pub fn is_gone(sub: &PushSubscription, status: u16, body: &str) -> bool {
    use kroma_domain::PushTransport as T;
    match sub.transport {
        T::WebPush => webpush::is_gone(status),
        T::Apns => apns::is_gone(status, body),
        T::Fcm => fcm::is_gone(status, body),
        // The relay reports Apple's and Google's verdict as its own 410, so a
        // dead device evicts identically whichever transport the row uses.
        T::Relay => relay::is_gone(status),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::{NotificationCategory, NotificationEvent, PushCategory, PushTransport};

    fn notification() -> Notification {
        Notification {
            id: "n1".into(),
            category: NotificationCategory::Requests,
            event: NotificationEvent::RequestAvailable,
            title: "Ready to watch".into(),
            body: "Dune is now in your library.".into(),
            link: Some("/movie/ab12".into()),
            image_url: Some("https://img/p.jpg".into()),
            actions: Vec::new(),
            push_category: None,
            read: false,
            created_at: 0,
        }
    }

    fn subscription(transport: PushTransport) -> PushSubscription {
        PushSubscription {
            id: "s1".into(),
            user_id: "u1".into(),
            transport,
            endpoint: "DEVICE-TOKEN".into(),
            p256dh: None,
            auth: None,
            device: None,
        }
    }

    #[test]
    fn an_unconfigured_transport_builds_nothing_rather_than_failing() {
        // A server with no Apple key must skip its APNs rows quietly, not error
        // on every notification.
        let senders = Senders::default();
        let n = notification();
        let out = Outgoing {
            notification: &n,
            web_payload: b"{}",
            urgency: Urgency::High,
            actions: Vec::new(),
            native_image: n.image_url.clone(),
        };
        for transport in [
            PushTransport::WebPush,
            PushTransport::Apns,
            PushTransport::Fcm,
        ] {
            let built = build(&senders, &subscription(transport), &out, 0).unwrap();
            assert!(built.is_none(), "{transport:?} should be skipped");
        }
        assert!(!senders.has_own_credentials());

        // …but the relay still builds on that same credential-less server: a
        // self-hosted install can never hold Apple's or Google's keys, so if this
        // were skipped too, no self-hosted server could ever notify a phone.
        let relayed = build(&senders, &subscription(PushTransport::Relay), &out, 0).unwrap();
        let relayed = relayed.expect("the relay needs no credentials");
        assert_eq!(relayed.url, "https://push.kroma.tv/v1/push");
    }

    #[test]
    fn the_push_category_reaches_the_native_payload() {
        // The whole reason `push_category` is stored: it is the only way APNs
        // and Android can show action buttons.
        let mut n = notification();
        assert_eq!(push_category(&n), None);
        n.push_category = Some(PushCategory::MediaAvailable);
        assert_eq!(push_category(&n), Some("media_available"));
        let out = Outgoing {
            notification: &n,
            web_payload: b"{}",
            urgency: Urgency::High,
            actions: Vec::new(),
            native_image: n.image_url.clone(),
        };
        assert_eq!(alert(&out).category, Some("media_available"));
        // And related notifications thread together by category.
        assert_eq!(alert(&out).thread_id, Some("requests"));
    }

    #[test]
    fn only_api_actions_ride_in_the_native_payload() {
        use kroma_domain::{ActionKind, ActionStyle, NotificationAction};
        let mut n = notification();
        n.actions = vec![
            NotificationAction {
                id: "approve".into(),
                label: "Approve".into(),
                kind: ActionKind::Api,
                href: "/api/requests/r1/approve".into(),
                method: Some("POST".into()),
                style: ActionStyle::Primary,
            },
            NotificationAction {
                id: "view".into(),
                label: "View".into(),
                kind: ActionKind::Link,
                href: "/movie/ab12".into(),
                method: None,
                style: ActionStyle::Default,
            },
        ];
        let actions = native_actions(&n);
        // A `link` action is plain navigation, which the tap handler already
        // covers; only the callable ones need their href carried.
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].0, "approve");
        assert_eq!(actions[0].1, "POST");
        assert_eq!(actions[0].2, "/api/requests/r1/approve");
    }

    #[test]
    fn gone_is_evaluated_per_transport() {
        // 410 is terminal everywhere; the 400 vocabularies differ.
        for transport in [PushTransport::WebPush, PushTransport::Apns] {
            assert!(is_gone(&subscription(transport), 410, ""));
        }
        assert!(is_gone(
            &subscription(PushTransport::Apns),
            400,
            r#"{"reason":"BadDeviceToken"}"#
        ));
        // The same 400 body means nothing to the other two.
        assert!(!is_gone(
            &subscription(PushTransport::WebPush),
            400,
            r#"{"reason":"BadDeviceToken"}"#
        ));
        assert!(!is_gone(
            &subscription(PushTransport::Fcm),
            400,
            r#"{"reason":"BadDeviceToken"}"#
        ));
        assert!(is_gone(&subscription(PushTransport::Fcm), 404, ""));
        // …and a transient failure never evicts, whichever service it came from.
        for transport in [
            PushTransport::WebPush,
            PushTransport::Apns,
            PushTransport::Fcm,
        ] {
            assert!(!is_gone(&subscription(transport), 503, ""));
            assert!(!is_gone(&subscription(transport), 429, ""));
        }
    }

    fn apple_senders() -> Senders {
        let key = kroma_push::apns::ApnsKey::new(
            &crate::test_support::test_apns_key_p8(),
            "ABC1234567",
            "TEAM123456",
            "tv.kroma.mobile",
            kroma_push::apns::Environment::Production,
        )
        .expect("the test key parses");
        Senders {
            web: None,
            apns: Some(Apns {
                key: std::sync::Arc::new(key),
            }),
            fcm: None,
        }
    }

    #[test]
    fn an_apple_row_on_a_server_that_holds_the_key_builds_a_signed_request() {
        let n = notification();
        let out = Outgoing {
            notification: &n,
            web_payload: b"{}",
            urgency: Urgency::High,
            actions: Vec::new(),
            native_image: n.image_url.clone(),
        };

        let built = build(
            &apple_senders(),
            &subscription(PushTransport::Apns),
            &out,
            0,
        )
        .unwrap()
        .expect("Apple is configured here");
        assert!(
            built.url.ends_with("/3/device/DEVICE-TOKEN"),
            "{}",
            built.url
        );
        assert!(built.http2, "APNs refuses HTTP/1.1");
    }

    #[test]
    fn a_token_apple_rejects_as_wrong_environment_is_retried_at_the_other_host() {
        let n = notification();
        let out = Outgoing {
            notification: &n,
            web_payload: b"{}",
            urgency: Urgency::High,
            actions: Vec::new(),
            native_image: None,
        };
        let mut request = build(
            &apple_senders(),
            &subscription(PushTransport::Apns),
            &out,
            0,
        )
        .unwrap()
        .expect("Apple is configured here");
        let first_host = request.url.clone();

        assert!(retry(
            &subscription(PushTransport::Apns),
            &mut request,
            400,
            r#"{"reason":"BadDeviceToken"}"#
        ));
        assert_ne!(
            request.url, first_host,
            "the retry must go to the other host"
        );

        let mut again = request.clone();
        assert!(!retry(
            &subscription(PushTransport::Apns),
            &mut again,
            410,
            ""
        ));
    }

    #[test]
    fn a_grant_the_relay_retires_evicts_the_row_it_stands_for() {
        let relay = subscription(PushTransport::Relay);
        assert!(is_gone(&relay, 410, ""));
        assert!(!is_gone(&relay, 404, ""));
        assert!(!is_gone(&relay, 503, ""));
    }
}
