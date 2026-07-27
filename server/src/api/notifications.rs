//! `/api/notifications` the per-user notification centre: read the inbox,
//! mark rows read, drop one, and manage the per-category delivery matrix.
//!
//! Every route here is scoped to the CALLER. There is no admin view of someone
//! else's inbox and no way to name another account: the user id always comes
//! from the session, never from the request, so an id guessed from a link is a
//! no-op rather than a leak.
//!
//! Rows are stored as i18n keys and rendered here in the caller's language (see
//! `services::notify::render`), which is why reading is not a plain SELECT.

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{NotificationPrefs, NotificationsView};
use crate::services::notify;
use crate::services::jobs::now_ms;
use crate::state::SharedState;

/// How many rows one inbox read returns. The store keeps 200 per user
/// (`db::notifications::RETENTION_PER_USER`); the bell only ever shows a page.
const PAGE: usize = 50;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/read", post(read))
        .route("/notifications/{id}", axum::routing::delete(remove))
        .route("/notifications/prefs", get(get_prefs).put(put_prefs))
}

/// `GET /api/notifications` the caller's inbox, newest first, plus the unread
/// tally that drives the bell badge.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let locale = notify::render::locale_of(&user).to_string();
    let uid = user.id.clone();
    let view = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let stored = db::notifications::list_notifications(&conn, &uid, PAGE, false)?;
        let unread = db::notifications::unread_count(&conn, &uid)?;
        Ok(NotificationsView {
            notifications: stored.iter().map(|s| notify::render::render(s, &locale)).collect(),
            unread,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

/// `POST /api/notifications/read` body. Omitting `ids` marks everything read
/// (the "mark all as read" affordance).
#[derive(Debug, Deserialize)]
pub struct ReadBody {
    #[serde(default)]
    pub ids: Option<Vec<String>>,
}

/// `POST /api/notifications/read` mark some (or all) of the caller's
/// notifications read, and tell their other devices so every badge agrees.
pub async fn read(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<ReadBody>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let unread = query(&state.db, move |pool| {
        db::notifications::mark_read(&pool, &uid, body.ids.as_deref(), now_ms())?;
        let conn = pool.get()?;
        db::notifications::unread_count(&conn, &uid).map_err(Into::into)
    })
    .await?;
    notify::publish_unread(&state, &user.id, unread);
    Ok(Json(serde_json::json!({ "unread": unread })).into_response())
}

/// `DELETE /api/notifications/:id` drop one of the caller's own rows.
pub async fn remove(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let unread = query(&state.db, move |pool| {
        db::notifications::delete_notification(&pool, &uid, &id)?;
        let conn = pool.get()?;
        db::notifications::unread_count(&conn, &uid).map_err(Into::into)
    })
    .await?;
    notify::publish_unread(&state, &user.id, unread);
    Ok(axum::http::StatusCode::NO_CONTENT.into_response())
}

/// `GET /api/notifications/prefs` the full per-category matrix, defaults
/// filled in, so the settings screen can render every switch without knowing
/// which ones were explicitly set.
pub async fn get_prefs(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let categories = query(&state.db, move |pool| {
        let conn = pool.get()?;
        db::notifications::prefs(&conn, &uid).map_err(Into::into)
    })
    .await?;
    Ok(Json(NotificationPrefs { categories }).into_response())
}

/// `PUT /api/notifications/prefs` replace the caller's matrix.
pub async fn put_prefs(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NotificationPrefs>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let categories = query(&state.db, move |pool| {
        db::notifications::set_prefs(&pool, &uid, &body.categories)?;
        let conn = pool.get()?;
        db::notifications::prefs(&conn, &uid).map_err(Into::into)
    })
    .await?;
    Ok(Json(NotificationPrefs { categories }).into_response())
}
