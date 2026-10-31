//! Network admin API (`/api/admin/network/*`): the journal of outbound flows,
//! their daily summary, the rules that route them, and the sockets this server
//! listens on. Hostnames say what the household downloads, so every route
//! needs the settings capability rather than any admin one.

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::Permission;
use crate::services::network::{
    CallerPurpose, FlowFilter, MAX_BODY_BYTES, NetworkRules, RECENT_CAPACITY, RulesWriteError,
    Verdict,
};
use crate::state::SharedState;

mod listeners;

const DEFAULT_FLOWS: usize = 200;
const DEFAULT_SUMMARY_DAYS: u32 = 7;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/network/flows", get(list_flows))
        .route("/network/summary", get(summary))
        .route(
            "/network/rules",
            get(get_rules)
                .put(put_rules)
                .layer(DefaultBodyLimit::max(MAX_BODY_BYTES)),
        )
        .route("/network/listeners", get(listeners::list))
}

#[derive(Deserialize)]
struct FlowsQuery {
    limit: Option<usize>,
    caller: Option<String>,
    purpose: Option<String>,
    verdict: Option<Verdict>,
}

async fn list_flows(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(query): Query<FlowsQuery>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let filter = FlowFilter {
        limit: query.limit.unwrap_or(DEFAULT_FLOWS).min(RECENT_CAPACITY),
        caller: query.caller.filter(|c| !c.is_empty()),
        purpose: query.purpose.filter(|p| !p.is_empty()),
        verdict: query.verdict,
    };
    Ok(Json(json!({ "flows": state.network.flows(&filter) })).into_response())
}

#[derive(Deserialize)]
struct SummaryQuery {
    days: Option<u32>,
}

async fn summary(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(query): Query<SummaryQuery>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let days = query.days.unwrap_or(DEFAULT_SUMMARY_DAYS);
    let summary = blocking(move || state.network.summary(days)).await?;
    Ok(Json(summary).into_response())
}

#[derive(Serialize)]
struct RulesView {
    #[serde(flatten)]
    rules: NetworkRules,
    purposes: Vec<CallerPurpose>,
}

async fn get_rules(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let view = blocking(move || {
        Ok(RulesView {
            rules: state.network.rules(),
            purposes: state.network.purposes()?,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

async fn put_rules(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let rules: NetworkRules = serde_json::from_slice(&body)
        .map_err(|e| refused("invalid_body", &format!("not a rules document: {e}")))?;
    let written = tokio::task::spawn_blocking(move || state.network.set_rules(rules))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())?;
    match written {
        Ok(()) => Ok(StatusCode::NO_CONTENT.into_response()),
        Err(RulesWriteError::Invalid(error)) => Err(refused(error.code(), &error.to_string())),
        Err(RulesWriteError::Storage(error)) => {
            tracing::error!(error = %format!("{error:#}"), "the network rules could not be stored");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

fn refused(code: &str, detail: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": detail, "code": code })),
    )
        .into_response()
}
