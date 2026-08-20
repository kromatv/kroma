//! The `/_host/register-events` callback a sidecar POSTs to say which event
//! topics it wants, and the task that delivers them.
//!
//! Modules could already publish onto the bus and never hear it, so a module
//! could be CALLED by another one and never react to one. This is the other half:
//! the core reads the bus, matches each event's `type` against what modules asked
//! for, and POSTs it to each subscriber's `/_event/{topic}`.
//!
//! Push rather than a stream a module holds open, for the same reason jobs are
//! push: the supervisor already knows every module's port, a restarted module
//! needs no reconnection, and there is no connection to leak. The cost is that
//! delivery is best-effort — a module that was down missed what fired — so
//! anything that must not be missed belongs in a job that reconciles state.
//!
//! The core learns nothing about what a topic MEANS. It matches a string it was
//! handed against a string a module asked for.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use axum::http::StatusCode;
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_supervisor::Supervisor;

use crate::state::SharedState;

/// Who wants which topic. Rebuilt per registration rather than accumulated, so a
/// module that respawns with a different set replaces its old one.
#[derive(Default)]
pub struct Subscriptions {
    by_module: RwLock<HashMap<String, HashSet<String>>>,
}

impl Subscriptions {
    /// Replace `module_id`'s topics with `topics`. An empty set unsubscribes it.
    pub fn set(&self, module_id: &str, topics: HashSet<String>) {
        let mut all = self.by_module.write().unwrap();
        if topics.is_empty() {
            all.remove(module_id);
        } else {
            all.insert(module_id.to_string(), topics);
        }
    }

    /// The modules that asked for `topic`.
    pub fn wanting(&self, topic: &str) -> Vec<String> {
        self.by_module
            .read()
            .unwrap()
            .iter()
            .filter(|(_, topics)| topics.contains(topic))
            .map(|(id, _)| id.clone())
            .collect()
    }

    fn any(&self) -> bool {
        !self.by_module.read().unwrap().is_empty()
    }
}

/// The `/_host/register-events` route, guarded by the shared host token the same
/// way the other callbacks are.
pub fn routes(host_token: String, subs: Arc<Subscriptions>) -> Router<SharedState> {
    Router::new()
        .route("/_host/register-events", post(register))
        .route_layer(from_fn_with_state(HostToken(host_token), require_host_token))
        .layer(Extension(subs))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterBody {
    module_id: String,
    topics: Vec<String>,
}

async fn register(
    Extension(subs): Extension<Arc<Subscriptions>>,
    Json(body): Json<RegisterBody>,
) -> Response {
    let count = body.topics.len();
    subs.set(&body.module_id, body.topics.into_iter().collect());
    tracing::info!(module = %body.module_id, topics = count, "module subscribed to events");
    StatusCode::NO_CONTENT.into_response()
}

/// Read the bus forever and deliver each event to the modules that asked for its
/// topic. Spawned once at boot.
pub fn deliver(state: SharedState, supervisor: Arc<Supervisor>, subs: Arc<Subscriptions>) {
    tokio::spawn(async move {
        let mut rx = state.events.subscribe();
        loop {
            let envelope = match rx.recv().await {
                Ok(envelope) => envelope,
                // Lagged: the bus dropped events this task was too slow to read.
                // Say so and keep going; a gap is what best-effort means.
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(dropped = n, "module event delivery fell behind");
                    continue;
                }
                Err(_) => return,
            };
            if !subs.any() {
                continue;
            }
            // Addressed events are one user's business (a notification), and a
            // module is not a user. Only broadcasts are delivered.
            let payload = envelope.payload_unrouted();
            for (module_id, topic) in deliveries(payload, &subs) {
                post_event(&supervisor, &module_id, &topic, payload);
            }
        }
    });
}

/// Who this event goes to, as `(module id, topic)`. Separate from the send so the
/// routing decision is testable without a running module: an event's topic is its
/// `type`, and an event without one is addressable by nothing.
fn deliveries(payload: &str, subs: &Subscriptions) -> Vec<(String, String)> {
    let Some(topic) = topic_of(payload) else { return Vec::new() };
    subs.wanting(&topic).into_iter().map(|id| (id, topic.clone())).collect()
}

fn topic_of(payload: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    value.get("type")?.as_str().map(str::to_string)
}

fn post_event(supervisor: &Arc<Supervisor>, module_id: &str, topic: &str, payload: &str) {
    // Not running (disabled, or mid-respawn): dropped, not queued. The module
    // reconciles on its next job rather than replaying a backlog it cannot bound.
    let Some(port) = supervisor.port_of(module_id) else { return };
    let url = format!("http://127.0.0.1:{port}/_event/{topic}");
    let token = supervisor.host_token().to_string();
    let body = payload.to_string();
    // Off the bus task: one slow module must not hold up the next event, and the
    // sidecar answers before it does the work anyway.
    tokio::task::spawn_blocking(move || {
        let sent = kroma_http::Fetch::new()
            .header("authorization", format!("Bearer {token}"))
            .max_time(10)
            .post_bytes(&url, "application/json", body.as_bytes());
        if let Err(e) = sent {
            tracing::debug!(url = %url, "event delivery failed: {e:#}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // The callback a sidecar POSTs at boot, driven the way it drives it.
    async fn register_via_route(
        subs: Arc<Subscriptions>,
        body: serde_json::Value,
    ) -> StatusCode {
        let app = routes("host-token".into(), subs)
            .with_state(crate::api::test_support::test_app().state);
        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/_host/register-events")
            .header("authorization", "Bearer host-token")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap();
        tower::ServiceExt::oneshot(app, req).await.unwrap().status()
    }

    #[tokio::test]
    async fn a_sidecar_registers_its_topics_over_the_callback() {
        let subs = Arc::new(Subscriptions::default());

        let status = register_via_route(
            subs.clone(),
            serde_json::json!({ "moduleId": "tv.kroma.notes", "topics": ["item.added"] }),
        )
        .await;

        assert_eq!(status, StatusCode::NO_CONTENT);
        assert_eq!(subs.wanting("item.added"), vec!["tv.kroma.notes".to_string()]);
    }

    // The token guard is the same one the rest of the callback API uses; without
    // it any local process could subscribe itself to the bus.
    #[tokio::test]
    async fn the_callback_refuses_a_caller_with_no_host_token() {
        let subs = Arc::new(Subscriptions::default());
        let app = routes("host-token".into(), subs.clone())
            .with_state(crate::api::test_support::test_app().state);
        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/_host/register-events")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(
                serde_json::json!({ "moduleId": "m", "topics": ["a"] }).to_string(),
            ))
            .unwrap();

        let status = tower::ServiceExt::oneshot(app, req).await.unwrap().status();

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(subs.wanting("a").is_empty());
    }

    // Delivery reads the bus, so this is the whole path bar the HTTP hop: publish
    // through the core's own API and see what the fan-out would send.
    #[tokio::test]
    async fn what_the_core_publishes_is_what_delivery_routes() {
        let subs = Subscriptions::default();
        subs.set("tv.kroma.notes", ["item.added".to_string()].into());
        let app = crate::api::test_support::test_app();

        app.state.events.publish_value(serde_json::json!({ "type": "item.added", "id": "x" }));
        let payload = r#"{"type":"item.added","id":"x"}"#;

        assert_eq!(
            deliveries(payload, &subs),
            vec![("tv.kroma.notes".to_string(), "item.added".to_string())]
        );
    }

    #[test]
    fn a_module_gets_the_topics_it_asked_for_and_no_others() {
        let subs = Subscriptions::default();

        subs.set("tv.kroma.notes", ["item.added".to_string()].into());

        assert_eq!(subs.wanting("item.added"), vec!["tv.kroma.notes".to_string()]);
        assert!(subs.wanting("playback.progress").is_empty());
    }

    // A respawn re-registers, and the new set REPLACES the old one: a module that
    // dropped a topic must stop receiving it.
    #[test]
    fn re_registering_replaces_rather_than_adds() {
        let subs = Subscriptions::default();
        subs.set("m", ["a".to_string(), "b".to_string()].into());

        subs.set("m", ["b".to_string()].into());

        assert!(subs.wanting("a").is_empty());
        assert_eq!(subs.wanting("b"), vec!["m".to_string()]);
    }

    #[test]
    fn registering_nothing_unsubscribes() {
        let subs = Subscriptions::default();
        subs.set("m", ["a".to_string()].into());

        subs.set("m", HashSet::new());

        assert!(!subs.any());
        assert!(subs.wanting("a").is_empty());
    }

    #[test]
    fn two_modules_can_want_the_same_topic() {
        let subs = Subscriptions::default();
        subs.set("a", ["item.added".to_string()].into());
        subs.set("b", ["item.added".to_string()].into());

        let mut wanting = subs.wanting("item.added");
        wanting.sort();

        assert_eq!(wanting, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn an_event_goes_to_whoever_asked_for_its_type() {
        let subs = Subscriptions::default();
        subs.set("tv.kroma.notes", ["item.added".to_string()].into());

        let to = deliveries(r#"{"type":"item.added","id":"x"}"#, &subs);

        assert_eq!(to, vec![("tv.kroma.notes".to_string(), "item.added".to_string())]);
    }

    #[test]
    fn an_event_nobody_asked_for_goes_nowhere() {
        let subs = Subscriptions::default();
        subs.set("tv.kroma.notes", ["item.added".to_string()].into());

        assert!(deliveries(r#"{"type":"playback.progress"}"#, &subs).is_empty());
    }

    // The bus also carries shapes with no `type` at all; they are not addressable
    // by topic, so nothing wants them and nothing is sent.
    #[test]
    fn an_event_with_no_type_is_addressable_by_nothing() {
        let subs = Subscriptions::default();
        subs.set("m", ["item.added".to_string()].into());

        assert!(deliveries(r#"{"id":"x"}"#, &subs).is_empty());
        assert!(deliveries("not json", &subs).is_empty());
        assert!(deliveries(r#"{"type":7}"#, &subs).is_empty());
    }

    // Every subscriber of one topic gets its own delivery, so one module being
    // down does not stop another from hearing it.
    #[test]
    fn two_subscribers_are_two_deliveries() {
        let subs = Subscriptions::default();
        subs.set("a", ["item.added".to_string()].into());
        subs.set("b", ["item.added".to_string()].into());

        let mut to = deliveries(r#"{"type":"item.added"}"#, &subs);
        to.sort();

        assert_eq!(to.len(), 2);
        assert_eq!(to[0].1, "item.added");
    }
}
