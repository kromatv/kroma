//! The `/api/_host/*` callback API a sidecar reaches back into the core with:
//! settings, events, notifications, jobs, session lookups and the network
//! policy.

use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use kroma_module_host::{Event, HostCtx, NetworkPolicyOf, SettingReachOf};
use serde_json::{json, Value};

use super::Supervisor;

mod caller;
mod job;
mod network;
mod settings;

use caller::{resolve_caller, Caller};

/// The `/_host/*` callback router modules call back into (mount under `/api`).
/// Every route is behind a token the `supervisor` minted, which is what names the
/// calling module; `reach` is the core's answer for how far one settings key
/// reaches out of it, and `network` its policy on a module's outbound calls.
pub fn host_router<S>(
    supervisor: Arc<Supervisor>,
    reach: SettingReachOf,
    network: NetworkPolicyOf,
) -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/_host/setting", get(settings::get_setting::<S>))
        .route("/_host/settings", post(settings::set_settings::<S>))
        .route("/_host/events", post(publish_event::<S>))
        .route("/_host/events_to", post(publish_event_to::<S>))
        .route("/_host/notify", post(notify::<S>))
        .route("/_host/notify/resolve", post(resolve_notifications::<S>))
        .route("/_host/job", post(job::trigger_job::<S>))
        .route("/_host/enabled", get(module_enabled::<S>))
        .route("/_host/libraries", get(library_folders::<S>))
        .route("/_host/metadata-language", get(metadata_language::<S>))
        .route("/_host/metadata-search", get(metadata_search::<S>))
        .route("/_host/metadata-episodes", get(metadata_episodes::<S>))
        // By NAME: a sidecar asks for the credential it needs, and this route
        // never learns which vendors exist.
        .route("/_host/secret", get(secret::<S>))
        // Authentication, so a sidecar resolves the caller of one of its routes
        // without reading the `sessions` table, the last thing that made a
        // module with no storage of its own open a database.
        .route("/_host/session", post(session_user::<S>))
        // How a module reaches a peer: it asks for a CONTRACT and the core
        // answers with whoever serves it. No module id crosses this wire.
        .route("/_host/contributions", get(contributions))
        .route(
            "/_host/network/decide",
            post(network::decide).layer(DefaultBodyLimit::max(network::MAX_ASK_BYTES)),
        )
        .route(
            "/_host/network/flows",
            post(network::flows).layer(DefaultBodyLimit::max(network::MAX_FLOWS_BYTES)),
        )
        .route_layer(from_fn_with_state(supervisor, resolve_caller))
        .layer(Extension(reach))
        .layer(Extension(network))
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
    Json(
        tokio::task::spawn_blocking(move || host.session_user(&body.token))
            .await
            .ok()
            .flatten(),
    )
}

#[derive(serde::Deserialize)]
struct PointQuery {
    point: String,
}

async fn contributions(
    Extension(caller): Extension<Caller>,
    axum::extract::Query(q): axum::extract::Query<PointQuery>,
) -> Json<Vec<kroma_module_host::Contribution>> {
    Json(caller.contributions(&q.point))
}

#[derive(serde::Deserialize)]
struct EventBody {
    topic: String,
    payload: Value,
}

async fn publish_event<S: HostCtx>(
    State(host): State<S>,
    Json(body): Json<EventBody>,
) -> StatusCode {
    host.publish(Event {
        topic: body.topic,
        payload: body.payload,
    });
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
    host.publish_to(
        &body.user_id,
        Event {
            topic: body.topic,
            payload: body.payload,
        },
    );
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct NotifyBody {
    audience: kroma_module_host::Audience,
    spec: kroma_module_host::NotificationSpec,
}

// The core owns audience resolution and preference filtering, so a module can't
// reach past a user's settings.
async fn notify<S: HostCtx>(
    State(host): State<S>,
    Extension(caller): Extension<Caller>,
    Json(body): Json<NotifyBody>,
) -> Response {
    if let Some(name) = body.spec.module_type.as_deref() {
        if !caller.declares_notification(name) {
            let refusal = format!(
                "{} sent the notification type \"{name}\", which its module.json does not declare",
                caller.name()
            );
            return kroma_module_host::json_error(StatusCode::FORBIDDEN, &refusal);
        }
    }
    let sent = host.notify(&body.audience, &body.spec);
    Json(json!({ "sent": sent })).into_response()
}

#[derive(serde::Deserialize)]
struct ResolveBody {
    subject: kroma_module_host::NotificationSubject,
    event: kroma_module_host::NotificationEvent,
    #[serde(default)]
    by: Option<String>,
}

async fn resolve_notifications<S: HostCtx>(
    State(host): State<S>,
    Json(body): Json<ResolveBody>,
) -> Json<Value> {
    let resolved = host.resolve_notifications(&body.subject, body.event, body.by.as_deref());
    Json(json!({ "resolved": resolved }))
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

#[derive(serde::Deserialize)]
struct MetadataSearchQuery {
    q: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    year: Option<u32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpisodesQuery {
    tmdb_id: u64,
    season: u32,
}

async fn metadata_episodes<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(params): axum::extract::Query<EpisodesQuery>,
) -> Json<Vec<kroma_domain::metadata::EpisodeInfo>> {
    Json(host.metadata_episodes(params.tmdb_id, params.season))
}

async fn metadata_search<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(params): axum::extract::Query<MetadataSearchQuery>,
) -> Json<Vec<kroma_domain::metadata::MatchCandidate>> {
    Json(host.metadata_candidates(&params.q, &params.kind, params.year))
}
