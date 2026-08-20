//! The `/api/_host/*` callback API a sidecar reaches back into the core with:
//! settings, events, notifications, jobs and session lookups.

use std::collections::HashMap;
use std::sync::RwLock;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::{Event, HostCtx};
use axum::middleware::from_fn_with_state;
use serde_json::{json, Value};

/// The `/_host/*` callback router modules call back into (mount under `/api`),
/// guarded by the shared `token`.
pub fn host_router<S>(token: String) -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/_host/setting", get(get_setting::<S>))
        .route("/_host/settings", post(set_settings::<S>))
        .route("/_host/events", post(publish_event::<S>))
        .route("/_host/events_to", post(publish_event_to::<S>))
        .route("/_host/notify", post(notify::<S>))
        .route("/_host/job", post(trigger_job::<S>))
        .route("/_host/enabled", get(module_enabled::<S>))
        .route("/_host/libraries", get(library_folders::<S>))
        .route("/_host/metadata-language", get(metadata_language::<S>))
        // By NAME: a sidecar asks for the credential it needs, and this route
        // never learns which vendors exist.
        .route("/_host/secret", get(secret::<S>))
        // Authentication, so a sidecar resolves the caller of one of its routes
        // without reading the `sessions` table -- the last thing that made a
        // module with no storage of its own open a database.
        .route("/_host/session", post(session_user::<S>))
        // How a module reaches a peer: it asks for a CONTRACT and the core
        // answers with whoever serves it. No module id crosses this wire.
        .route("/_host/contributions", get(contributions::<S>))
        .route_layer(from_fn_with_state(HostToken(token), require_host_token))
}

#[derive(serde::Deserialize)]
struct SessionBody {
    token: String,
}

// A POST, unlike its neighbours here, because the argument is a live session
// token: a query string is the one place a secret reliably ends up in a log.
async fn session_user<S: HostCtx + Clone>(
    State(host): State<S>,
    Json(body): Json<SessionBody>,
) -> Json<Option<kroma_domain::User>> {
    Json(tokio::task::spawn_blocking(move || host.session_user(&body.token)).await.ok().flatten())
}

#[derive(serde::Deserialize)]
struct PointQuery {
    point: String,
}

async fn contributions<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<PointQuery>,
) -> Json<Vec<kroma_module_host::Contribution>> {
    Json(host.contributions(&q.point))
}

#[derive(serde::Deserialize)]
struct SettingQuery {
    key: String,
    kind: String,
    default: String,
}

async fn get_setting<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<SettingQuery>,
) -> Json<Value> {
    let value = match q.kind.as_str() {
        "bool" => json!(host.setting_bool(&q.key, q.default == "true")),
        "i64" => json!(host.setting_i64(&q.key, q.default.parse().unwrap_or(0))),
        _ => json!(host.setting_str(&q.key, &q.default)),
    };
    Json(json!({ "value": value }))
}

#[derive(serde::Deserialize)]
struct SettingsPatch {
    patch: std::collections::BTreeMap<String, Value>,
}

async fn set_settings<S: HostCtx>(State(host): State<S>, Json(body): Json<SettingsPatch>) -> StatusCode {
    host.set_settings(body.patch);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct EventBody {
    topic: String,
    payload: Value,
}

async fn publish_event<S: HostCtx>(State(host): State<S>, Json(body): Json<EventBody>) -> StatusCode {
    host.publish(Event { topic: body.topic, payload: body.payload });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct AddressedEventBody {
    #[serde(rename = "userId")]
    user_id: String,
    topic: String,
    payload: Value,
}

async fn publish_event_to<S: HostCtx>(
    State(host): State<S>,
    Json(body): Json<AddressedEventBody>,
) -> StatusCode {
    host.publish_to(&body.user_id, Event { topic: body.topic, payload: body.payload });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct NotifyBody {
    audience: kroma_module_host::Audience,
    spec: kroma_module_host::NotificationSpec,
}

// The core owns audience resolution and preference filtering, so a module can't
// reach past a user's settings.
async fn notify<S: HostCtx>(State(host): State<S>, Json(body): Json<NotifyBody>) -> Json<Value> {
    let sent = host.notify(&body.audience, &body.spec);
    Json(json!({ "sent": sent }))
}

#[derive(serde::Deserialize)]
struct JobBody {
    key: String,
    reason: String,
}

// `trigger_job` takes `&'static str` for in-process callers passing literals, so
// a key off the wire has to be leaked. Job keys are a small fixed vocabulary;
// this ceiling is what keeps a sidecar sending unbounded new ones from growing
// the core's memory one callback at a time.
const MAX_INTERNED: usize = 512;

type InternPool = RwLock<HashMap<String, &'static str>>;

fn intern_in(pool: &InternPool, s: String) -> Option<&'static str> {
    if let Some(found) = pool.read().unwrap().get(&s) {
        return Some(found);
    }
    let mut pool = pool.write().unwrap();
    if let Some(found) = pool.get(&s) {
        return Some(found);
    }
    if pool.len() >= MAX_INTERNED {
        return None;
    }
    let leaked: &'static str = Box::leak(s.clone().into_boxed_str());
    pool.insert(s, leaked);
    Some(leaked)
}

// Keys and reasons get a ceiling each: `key` is a closed vocabulary, `reason` is
// free-form, and one pool would let a module's reasons exhaust the slots every
// future key needs.
fn intern_key(s: String) -> Option<&'static str> {
    static KEYS: std::sync::OnceLock<InternPool> = std::sync::OnceLock::new();
    intern_in(KEYS.get_or_init(|| RwLock::new(HashMap::new())), s)
}

fn intern_reason(s: String) -> Option<&'static str> {
    static REASONS: std::sync::OnceLock<InternPool> = std::sync::OnceLock::new();
    intern_in(REASONS.get_or_init(|| RwLock::new(HashMap::new())), s)
}

async fn trigger_job<S: HostCtx>(State(host): State<S>, Json(body): Json<JobBody>) -> StatusCode {
    let Some(key) = intern_key(body.key) else {
        tracing::warn!("refusing to intern another job key; a module is sending unbounded ones");
        return StatusCode::BAD_REQUEST;
    };
    host.trigger_job(key, intern_reason(body.reason).unwrap_or("module"));
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct EnabledQuery {
    id: String,
}

async fn module_enabled<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<EnabledQuery>,
) -> Json<Value> {
    Json(json!({ "enabled": host.module_enabled(&q.id) }))
}

async fn library_folders<S: HostCtx>(State(host): State<S>) -> Json<Value> {
    Json(json!(host.library_folders()))
}

#[derive(serde::Deserialize)]
struct SecretQuery {
    name: String,
}

async fn secret<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<SecretQuery>,
) -> Json<Option<String>> {
    Json(host.secret(&q.name))
}

async fn metadata_language<S: HostCtx>(State(host): State<S>) -> Json<String> {
    Json(host.metadata_language())
}

#[cfg(test)]
mod tests {
    use super::{intern_in, InternPool, MAX_INTERNED};

    #[test]
    fn a_job_key_off_the_wire_is_leaked_once_and_only_so_many_times() {
        let pool = InternPool::new(std::collections::HashMap::new());

        assert_eq!(
            intern_in(&pool, "acquisition.import".to_string()),
            Some("acquisition.import")
        );
        assert_eq!(
            intern_in(&pool, "acquisition.import".to_string()).map(str::as_ptr),
            intern_in(&pool, "acquisition.import".to_string()).map(str::as_ptr),
            "a key seen twice must not be leaked twice",
        );

        for n in 0..MAX_INTERNED {
            intern_in(&pool, format!("flood.{n}"));
        }

        assert_eq!(intern_in(&pool, "flood.past-the-ceiling".to_string()), None);
    }
}
