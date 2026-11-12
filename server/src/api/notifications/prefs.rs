use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::model::PrefsUpdate;
use crate::services::notify;
use crate::state::SharedState;

/// `GET /api/notifications/prefs` the full matrix, every category and every
/// kind of notification under them, defaults filled in, so the settings screen
/// can render every switch without knowing which ones were explicitly set.
pub async fn get_prefs(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let locale = notify::render::locale_of(&user);
    let uid = user.id.clone();
    let types = notify::types::types_of(&state);
    let host = state.clone();
    let prefs = query(&state.db, move |pool| {
        let enabled = |id: &str| kroma_engine::modules::module_enabled(&host.settings, id);
        notify::preferences::matrix(&pool.get()?, &uid, &types, enabled, locale)
    })
    .await?;
    Ok(Json(prefs).into_response())
}

/// `PUT /api/notifications/prefs` write what the caller changed. A client
/// built before per-type choice sends categories alone, and its reader's
/// types keep what they had.
pub async fn put_prefs(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<PrefsUpdate>,
) -> Result<Response, Response> {
    let locale = notify::render::locale_of(&user);
    let uid = user.id.clone();
    let types = notify::types::types_of(&state);
    let host = state.clone();
    let prefs = query(&state.db, move |pool| {
        let enabled = |id: &str| kroma_engine::modules::module_enabled(&host.settings, id);
        notify::preferences::save(&pool, &uid, &body, &types, enabled, locale)
    })
    .await?;
    Ok(Json(prefs).into_response())
}
