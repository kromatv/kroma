use std::path::PathBuf;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, post};
use axum::{Json, Router};
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{json_error, run_blocking, AuthUser, HostCtx};
use serde::Deserialize;
use serde_json::json;

use crate::routes::bring_up;

/// `POST /vpn/saved` body: WireGuard configs to keep. With `use`, the first of
/// them becomes the tunnel's at once.
#[derive(Debug, Deserialize)]
pub struct SaveConfigsBody {
    pub configs: Vec<String>,
    #[serde(default, rename = "use")]
    pub use_first: bool,
}

const MAX_CONFIGS: usize = 64;

pub fn routes<S>() -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/vpn/saved", post(save::<S>))
        .route("/vpn/saved/{id}/use", post(use_saved::<S>))
        .route("/vpn/saved/{id}", delete(remove::<S>))
}

fn dir(host: &dyn HostCtx) -> PathBuf {
    host.data_dir().join("vpn")
}

fn failed() -> Response {
    json_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "the request did not finish",
    )
}

fn listed(host: &dyn HostCtx) -> Response {
    let saved = super::views(&dir(host), &host.setting_str("vpnWgConfig", ""));
    Json(json!({ "saved": saved })).into_response()
}

async fn switch_to<S: HostCtx + Clone + Send + Sync + 'static>(
    state: &S,
    config: String,
) -> Result<(), Response> {
    let held = dir(state);
    run_blocking(move || crate::mullvad::forget(&held))
        .await
        .map_err(|_| failed())?;
    bring_up(state, config).await;
    Ok(())
}

async fn save<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<SaveConfigsBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    if body.configs.is_empty() || body.configs.len() > MAX_CONFIGS {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "between 1 and 64 configs",
        ));
    }
    if let Some(index) = body.configs.iter().position(|c| !super::is_wireguard(c)) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "code": "invalidConfig", "index": index })),
        )
            .into_response());
    }
    let ids = super::add(&dir(&state), &body.configs).map_err(|_| failed())?;
    if body.use_first {
        if let Some(first) = ids.first().and_then(|id| super::find(&dir(&state), id)) {
            switch_to(&state, first.config).await?;
        }
    }
    Ok(listed(&state))
}

async fn use_saved<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let saved = super::find(&dir(&state), &id)
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no such config"))?;
    switch_to(&state, saved.config).await?;
    Ok(listed(&state))
}

async fn remove<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let held = dir(&state);
    let was_active = super::find(&held, &id)
        .is_some_and(|saved| saved.config.trim() == state.setting_str("vpnWgConfig", "").trim());
    super::remove(&held, &id).map_err(|_| failed())?;
    if was_active {
        bring_up(&state, String::new()).await;
    }
    Ok(listed(&state))
}
