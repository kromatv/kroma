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
use crate::model::{
    Notification, NotificationCategory, NotificationEvent, NotificationPrefs, NotificationsView,
    SubscribeBody,
};
use crate::services::auth::random_token;
use crate::services::scan::short_hash;
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

// ----- Web Push subscriptions -------------------------------------------------

/// `GET /api/push/key` the server's VAPID public key, which the browser needs
/// as `applicationServerKey` before it can subscribe. Also reports whether this
/// account already has an endpoint registered, so the settings toggle renders in
/// the right state without a second round trip.
///
/// The keypair is minted here on first call rather than at startup: a server
/// whose users never enable push never needs one.
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

/// `POST /api/push/subscribe` register this device's push endpoint.
///
/// The endpoint is keyed on `(transport, endpoint)`, so re-subscribing the same
/// browser updates its row rather than piling up duplicates, and a browser now
/// signed into a different account moves with it.
pub async fn subscribe(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SubscribeBody>,
) -> Result<Response, Response> {
    let loc = notify::render::locale_of(&user).to_string();
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
                locale: Some(loc),
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
    let locale = notify::render::locale_of(&user).to_string();
    let uid = user.id.clone();
    let delivered = blocking(move || {
        let notification = Notification {
            id: "test".into(),
            category: NotificationCategory::System,
            event: NotificationEvent::SystemJobFailed,
            title: kroma_engine::i18n::t(&locale, "notifications.test.title", &[]),
            body: kroma_engine::i18n::t(&locale, "notifications.test.body", &[]),
            link: Some("/".into()),
            image_url: None,
            actions: Vec::new(),
            read: false,
            created_at: now_ms(),
        };
        Ok(kroma_engine::services::notify::push::deliver(&bg, &uid, &notification))
    })
    .await?;
    Ok(Json(serde_json::json!({ "delivered": delivered })).into_response())
}
