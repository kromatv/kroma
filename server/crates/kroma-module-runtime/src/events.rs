use std::collections::HashMap;
use std::sync::Arc;

use axum::http::StatusCode;
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::ServerModule;

use crate::remote_host::RemoteHost;

// Deduplicated: two modules in one process may both want a topic, and the core
// should be told about it once.
pub(crate) fn wanted_topics(modules: &[Box<dyn ServerModule<RemoteHost>>]) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for topic in modules.iter().flat_map(|module| module.events()) {
        if !seen.iter().any(|t| t == topic) {
            seen.push(topic.to_string());
        }
    }
    seen
}

// Which modules in this process asked for which topic. Held as trait objects
// because delivery dispatches on the topic at request time, not at wiring time.
pub(crate) struct Subscribers {
    modules: Arc<Vec<Box<dyn ServerModule<RemoteHost>>>>,
    by_topic: HashMap<String, Vec<usize>>,
}

impl Subscribers {
    pub(crate) fn new(
        modules: Arc<Vec<Box<dyn ServerModule<RemoteHost>>>>,
        topics: &[String],
    ) -> Self {
        let mut by_topic: HashMap<String, Vec<usize>> = HashMap::new();
        for topic in topics {
            let want = modules
                .iter()
                .enumerate()
                .filter(|(_, m)| m.events().iter().any(|t| t == topic))
                .map(|(i, _)| i)
                .collect();
            by_topic.insert(topic.clone(), want);
        }
        Self { modules, by_topic }
    }
}

pub(crate) fn event_router(
    subscribers: Arc<Subscribers>,
    token: String,
) -> axum::Router<RemoteHost> {
    axum::Router::new()
        .route("/_event/{topic}", axum::routing::post(deliver_event))
        .route_layer(axum::middleware::from_fn_with_state(
            HostToken(token),
            require_host_token,
        ))
        .layer(axum::Extension(subscribers))
}

// Answers before the handlers run: the core is fanning out to every subscriber
// and must not be held up by one module's work, and it has nothing to do with a
// failure anyway. A handler that needs to report something publishes or notifies.
async fn deliver_event(
    axum::extract::State(host): axum::extract::State<RemoteHost>,
    axum::Extension(subscribers): axum::Extension<Arc<Subscribers>>,
    axum::extract::Path(topic): axum::extract::Path<String>,
    axum::Json(payload): axum::Json<serde_json::Value>,
) -> StatusCode {
    let Some(want) = subscribers.by_topic.get(&topic) else {
        tracing::debug!(%topic, "event delivered for a topic this process did not ask for");
        return StatusCode::NOT_FOUND;
    };
    let want = want.clone();
    let modules = subscribers.modules.clone();
    tokio::spawn(async move {
        for index in want {
            modules[index]
                .on_event(host.clone(), topic.clone(), payload.clone())
                .await;
        }
    });
    StatusCode::ACCEPTED
}

pub(crate) fn register_events(url: &str, module_id: &str, host_token: &str, topics: &[String]) {
    let body = serde_json::json!({ "moduleId": module_id, "topics": topics });
    match kroma_http::Loopback::new()
        .header("authorization", format!("Bearer {host_token}"))
        .post_json(url, &body)
    {
        Ok(resp) if (200..300).contains(&resp.status) => {
            tracing::info!(?topics, "subscribed to core events");
        }
        Ok(resp) => tracing::warn!(
            status = resp.status,
            "core rejected the event subscription: {}",
            resp.text()
        ),
        Err(e) => tracing::warn!("could not subscribe to core events: {e:#}"),
    }
}
