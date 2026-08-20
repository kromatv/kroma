use kroma_db::push_subs::{self, PushSubscription};
use kroma_module_host::HostStorage;

use kroma_domain::{Notification, NotificationCategory, NotificationEvent, User};

use crate::services::jobs::now_ms;
use crate::services::notify::art;

use super::credentials::sender;
use super::transports;
use super::{payload_of, public_url_of, urgency_of, Sender};

#[cfg(test)]
mod tests;

/// Sends to every endpoint `user_id` has registered and returns how many
/// accepted it. Any failure here costs a push, never the in-app notification.
pub fn deliver<S: HostStorage>(
    state: &S,
    sender: &Sender,
    user_id: &str,
    notification: &Notification,
) -> usize {
    // Scoped deliberately: everything below is blocking network I/O and takes
    // connections of its own, so holding one across the sends pins a pool slot
    // and contends with the very pool it is about to ask again.
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
        native_image: art::native_image_url(notification, public_url_of(state).as_deref()),
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

/// Sends one "push is working" message to a user's own devices, deliberately
/// bypassing the category preferences: the user just pressed the button.
pub fn send_test<S: HostStorage>(state: &S, user: &User) -> anyhow::Result<usize> {
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

// `Ok(false)` = not delivered but handled (dropped as gone, or a transport
// this server has no credentials for).
fn send_one<S: HostStorage>(
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
        tracing::info!(
            endpoint = %sub.endpoint, status = response.status,
            "dropping dead push endpoint"
        );
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
        return Ok(false);
    }
    if is_transient(response.status) {
        // Not this endpoint's fault, so it earns no strike.
        anyhow::bail!("push service is unavailable ({}): {body}", response.status)
    }
    if push_subs::record_failure(state.db(), &sub.id).unwrap_or(false) {
        tracing::info!(endpoint = %sub.endpoint, "dropping push endpoint after repeated failures");
        let _ = push_subs::drop_subscription(state.db(), &sub.id);
    }
    anyhow::bail!("push service returned {} {body}", response.status)
}

// Whether a rejection is the SERVICE's problem rather than this endpoint's. A
// 429 or 5xx hits every device at once, so counting it towards
// `push_subs::MAX_FAILURES` unsubscribes a whole household on one outage.
fn is_transient(status: u16) -> bool {
    // 408: no transport sends it today, but a proxy in front of one can.
    status == 408 || status == 429 || (500..600).contains(&status)
}

// `http2` is not a preference: APNs refuses HTTP/1.1 outright.
pub(super) fn send(request: &kroma_push::PushRequest) -> anyhow::Result<kroma_http::Response> {
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
