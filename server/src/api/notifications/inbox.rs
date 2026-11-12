//! What a reader does to the rows of their own inbox: read and unread, seen,
//! archived and back, an action pressed, and delete for the clients that still
//! offer it. Every transition answers the counts it leaves and tells the
//! reader's other devices, so every badge agrees.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::services::jobs::now_ms;
use crate::services::notify;
use crate::state::SharedState;

/// `POST /api/notifications/read` body. Omitting `ids` marks everything read
/// (the "mark all as read" affordance).
#[derive(Debug, Deserialize)]
pub struct ReadBody {
    #[serde(default)]
    pub ids: Option<Vec<String>>,
}

/// The body of every per-row transition that has no "all": unread, archive and
/// unarchive.
#[derive(Debug, Deserialize)]
pub struct IdsBody {
    pub ids: Vec<String>,
}

#[derive(Clone, Copy)]
struct Counts {
    unread: u32,
    unseen: u32,
}

fn counts(pool: &db::Pool, user_id: &str) -> anyhow::Result<Counts> {
    let conn = pool.get()?;
    Ok(Counts {
        unread: db::notifications::unread_count(&conn, user_id)?,
        unseen: db::notifications::unseen_count(&conn, user_id)?,
    })
}

fn answer(state: &SharedState, user_id: &str, counts: Counts) -> Response {
    notify::publish_counts(state, user_id, counts.unread, counts.unseen);
    Json(serde_json::json!({ "unread": counts.unread, "unseen": counts.unseen })).into_response()
}

/// `POST /api/notifications/read` mark some (or all) of the caller's
/// notifications read.
pub async fn read(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<ReadBody>,
) -> Result<Response, Response> {
    let ids = bounded(body.ids.as_deref())?;
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        db::notifications::mark_read(&pool, &uid, ids.as_deref(), now_ms())?;
        counts(&pool, &uid)
    })
    .await?;
    Ok(answer(&state, &user.id, moved))
}

/// `POST /api/notifications/unread` put rows back in the unread pile, so a
/// reader can undo a read without waiting for the event to happen again.
pub async fn unread(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<IdsBody>,
) -> Result<Response, Response> {
    let ids = bounded(Some(&body.ids))?.unwrap_or_default();
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        db::notifications::mark_unread(&pool, &uid, &ids)?;
        counts(&pool, &uid)
    })
    .await?;
    Ok(answer(&state, &user.id, moved))
}

/// `POST /api/notifications/seen` the caller opened the panel: every row in the
/// inbox counts as seen, and the badge clears.
pub async fn seen(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        let conn = pool.get()?;
        db::notifications::mark_seen(&conn, &uid, now_ms())?;
        counts(&pool, &uid)
    })
    .await?;
    Ok(answer(&state, &user.id, moved))
}

/// `POST /api/notifications/archive` put rows away: they leave the inbox and
/// the badge, and are the first the store drops.
pub async fn archive(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<IdsBody>,
) -> Result<Response, Response> {
    set_archived(state, user, body, Some(now_ms())).await
}

/// `POST /api/notifications/archive/read` put away every row the caller has
/// already read, past the page the panel shows as well.
pub async fn archive_read(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        let conn = pool.get()?;
        db::notifications::archive_read(&conn, &uid, now_ms())?;
        counts(&pool, &uid)
    })
    .await?;
    Ok(answer(&state, &user.id, moved))
}

/// `POST /api/notifications/unarchive` bring archived rows back to the inbox.
pub async fn unarchive(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<IdsBody>,
) -> Result<Response, Response> {
    set_archived(state, user, body, None).await
}

async fn set_archived(
    state: SharedState,
    user: crate::model::User,
    body: IdsBody,
    archived_at: Option<i64>,
) -> Result<Response, Response> {
    let ids = bounded(Some(&body.ids))?.unwrap_or_default();
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        db::notifications::set_archived(&pool, &uid, &ids, archived_at)?;
        counts(&pool, &uid)
    })
    .await?;
    Ok(answer(&state, &user.id, moved))
}

/// `POST /api/notifications/:id/interacted` the caller pressed one of the row's
/// actions. Only the first press is kept.
pub async fn interacted(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    query(&state.db, move |pool| {
        let conn = pool.get()?;
        db::notifications::mark_interacted(&conn, &uid, &id, now_ms())?;
        Ok(())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `DELETE /api/notifications/:id` drop one of the caller's own rows. Archive
/// replaced it in the clients; it stays for the app builds that still call it.
pub async fn remove(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let moved = query(&state.db, move |pool| {
        db::notifications::delete_notification(&pool, &uid, &id)?;
        counts(&pool, &uid)
    })
    .await?;
    notify::publish_counts(&state, &user.id, moved.unread, moved.unseen);
    Ok(StatusCode::NO_CONTENT.into_response())
}

// A caller can own at most `RETENTION_PER_USER` rows, so a longer list is not a
// request anyone can mean: refuse it before it becomes that many SQL bindings.
fn bounded(ids: Option<&[String]>) -> Result<Option<Vec<String>>, Response> {
    match ids {
        None => Ok(None),
        Some(ids) if ids.len() <= db::notifications::RETENTION_PER_USER => Ok(Some(ids.to_vec())),
        Some(_) => Err((StatusCode::BAD_REQUEST, "too many ids").into_response()),
    }
}
