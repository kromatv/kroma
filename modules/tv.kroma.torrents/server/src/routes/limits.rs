//! `/downloads/limits` the engine's throughput and parallelism ceilings.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{AuthUser, HostStorage};

use super::{dm, require_downloads};
use crate::downloads::{DOWN_KBPS_KEY, MAX_ACTIVE_KEY, UP_KBPS_KEY};
use crate::LimitsView;

const MAX_KBPS: i64 = 10_000_000;
const MAX_PARALLEL: i64 = 500;

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(
        "/downloads/limits",
        get(read::<S>).put(save::<S>).post(save::<S>),
    )
}

fn stored<S: HostStorage>(state: &S) -> LimitsView {
    LimitsView {
        down_kbps: state.setting_i64(DOWN_KBPS_KEY, 0),
        up_kbps: state.setting_i64(UP_KBPS_KEY, 0),
        max_active: state.setting_i64(MAX_ACTIVE_KEY, 0),
    }
}

pub async fn read<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    Ok(Json(stored(&state)).into_response())
}

pub async fn save<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<LimitsView>,
) -> Result<Response, Response> {
    // Changing a ceiling is an engine-wide act, so it takes the operator
    // capability rather than the moderator one that can drive a single row.
    state.require(&user, Permission::SettingsManage)?;
    let patch = [
        (DOWN_KBPS_KEY, body.down_kbps.clamp(0, MAX_KBPS)),
        (UP_KBPS_KEY, body.up_kbps.clamp(0, MAX_KBPS)),
        (MAX_ACTIVE_KEY, body.max_active.clamp(0, MAX_PARALLEL)),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), json!(value)))
    .collect();
    state.set_settings(patch);
    dm(&state).apply_rate_limits(&state);
    Ok(Json(stored(&state)).into_response())
}
