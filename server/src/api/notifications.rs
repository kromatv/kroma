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
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::{blocking, query};
use crate::db;
use crate::model::{NotificationPrefs, NotificationsView, SubscribeBody};
use crate::services::auth::random_token;
use crate::services::scan::short_hash;
use crate::services::notify;
use crate::services::jobs::now_ms;
use crate::state::SharedState;

// The store keeps 200 rows per user (`db::notifications::RETENTION_PER_USER`);
// the bell only ever shows a page.
const PAGE: usize = 50;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/read", post(read))
        .route("/notifications/unread", post(unread))
        .route("/notifications/{id}", axum::routing::delete(remove))
        .route("/notifications/prefs", get(get_prefs).put(put_prefs))
        .route("/push/key", get(push_key))
        .route("/push/subscribe", post(subscribe).delete(unsubscribe))
        .route("/push/test", post(push_test))
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
    let ids = bounded(body.ids.as_deref())?;
    let uid = user.id.clone();
    let unread = query(&state.db, move |pool| {
        db::notifications::mark_read(&pool, &uid, ids.as_deref(), now_ms())?;
        let conn = pool.get()?;
        db::notifications::unread_count(&conn, &uid).map_err(Into::into)
    })
    .await?;
    notify::publish_unread(&state, &user.id, unread);
    Ok(Json(serde_json::json!({ "unread": unread })).into_response())
}

/// `POST /api/notifications/unread` body. Unlike the read side there is no
/// "all": the affordance is per-row, so a list of ids is always required.
#[derive(Debug, Deserialize)]
pub struct UnreadBody {
    pub ids: Vec<String>,
}

/// `POST /api/notifications/unread` put rows back in the unread pile, so a
/// reader can undo a read without waiting for the event to happen again, and
/// tell their other devices so every badge agrees.
pub async fn unread(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<UnreadBody>,
) -> Result<Response, Response> {
    let ids = bounded(Some(&body.ids))?.unwrap_or_default();
    let uid = user.id.clone();
    let unread = query(&state.db, move |pool| {
        db::notifications::mark_unread(&pool, &uid, &ids)?;
        let conn = pool.get()?;
        db::notifications::unread_count(&conn, &uid).map_err(Into::into)
    })
    .await?;
    notify::publish_unread(&state, &user.id, unread);
    Ok(Json(serde_json::json!({ "unread": unread })).into_response())
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

/// `GET /api/push/key` the server's VAPID public key (`applicationServerKey`),
/// plus whether this account already has an endpoint registered, so the
/// settings toggle renders without a second round trip. The keypair is minted
/// on first call, not at startup, since most servers never need one.
pub async fn push_key(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let bg = state.clone();
    let uid = user.id.clone();
    let (key, subscribed) = blocking(move || {
        let key = kroma_engine::services::notify::push::public_key(&bg)?;
        let subscribed = kroma_engine::services::notify::push::is_subscribed(&bg, &uid);
        Ok((key, subscribed))
    })
    .await?;
    Ok(Json(serde_json::json!({ "publicKey": key, "subscribed": subscribed })).into_response())
}

/// `POST /api/push/subscribe` register this device's push endpoint. Keyed on
/// `(transport, endpoint)`, so re-subscribing the same browser updates its row
/// instead of piling up duplicates, and follows the browser to a new account.
pub async fn subscribe(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SubscribeBody>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    query(&state.db, move |pool| {
        let id = short_hash(&format!("push|{uid}|{}|{}", body.endpoint, random_token()));
        db::push_subs::upsert_subscription(
            &pool,
            &db::push_subs::NewSubscription {
                id,
                user_id: uid,
                transport: body.transport,
                endpoint: body.endpoint,
                p256dh: body.p256dh,
                auth: body.auth,
                device: body.device,
            },
            now_ms(),
        )
    })
    .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `DELETE /api/push/subscribe` drop this device's endpoint (the user turned
/// push off, or the browser's subscription changed).
pub async fn unsubscribe(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<UnsubscribeBody>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    query(&state.db, move |pool| {
        db::push_subs::delete_subscription(&pool, &uid, &body.endpoint).map(|_| ())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `POST /api/push/subscribe` body's counterpart for removal.
#[derive(Debug, Deserialize)]
pub struct UnsubscribeBody {
    pub endpoint: String,
}

/// `POST /api/push/test` send the caller one push, so "is this actually
/// working?" is answerable from the settings screen instead of by waiting for a
/// real event. Reports how many of the caller's devices accepted it.
pub async fn push_test(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let bg = state.clone();
    let delivered =
        blocking(move || kroma_engine::services::notify::push::send_test(&bg, &user)).await?;
    Ok(Json(serde_json::json!({ "delivered": delivered })).into_response())
}
