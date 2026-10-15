//! `/downloads/limits` the engine's throughput and parallelism ceilings.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{blocking, AuthUser, HostStorage};

use super::{dm, require_downloads};
use crate::db;
use crate::downloads::{
    cache_minutes, keeps_watched, CACHE_MINUTES_KEY, DOWN_KBPS_KEY, KEEP_WATCHED_KEY,
    MAX_ACTIVE_KEY, UP_KBPS_KEY,
};
use crate::LimitsView;

const MAX_KBPS: i64 = 10_000_000;
const MAX_PARALLEL: i64 = 500;
const MAX_CACHE_MINUTES: i64 = 7 * 24 * 60;

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
        watch_keep_in_library: Some(keeps_watched(state.store())),
        watch_cache_minutes: Some(cache_minutes(state.store())),
    }
}

async fn as_stored<S: HostStorage + Clone + Send + Sync + 'static>(
    state: &S,
) -> Result<LimitsView, Response> {
    let state = state.clone();
    blocking(move || Ok(stored(&state))).await
}

pub async fn read<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    Ok(Json(as_stored(&state).await?).into_response())
}

pub async fn save<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<LimitsView>,
) -> Result<Response, Response> {
    // Changing a ceiling is an engine-wide act, so it takes the operator
    // capability rather than the moderator one that can drive a single row.
    state.require(&user, Permission::SettingsManage)?;
    let ceilings = [
        (DOWN_KBPS_KEY, body.down_kbps.clamp(0, MAX_KBPS)),
        (UP_KBPS_KEY, body.up_kbps.clamp(0, MAX_KBPS)),
        (MAX_ACTIVE_KEY, body.max_active.clamp(0, MAX_PARALLEL)),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), json!(value)))
    .collect();
    state.set_settings(ceilings);
    let watch: Vec<(&str, String)> = [
        body.watch_keep_in_library
            .map(|keep| (KEEP_WATCHED_KEY, keep.to_string())),
        body.watch_cache_minutes.map(|minutes| {
            (
                CACHE_MINUTES_KEY,
                minutes.clamp(1, MAX_CACHE_MINUTES).to_string(),
            )
        }),
    ]
    .into_iter()
    .flatten()
    .collect();
    let store = state.store().clone();
    blocking(move || {
        for (key, value) in watch {
            db::set_setting(&store, key, &value)?;
        }
        Ok(())
    })
    .await?;
    dm(&state).apply_rate_limits(&state);
    Ok(Json(as_stored(&state).await?).into_response())
}
