//! `/api/notifications` the per-user notification centre: read the inbox,
//! move its rows between states (see [`inbox`]), and manage the per-category
//! delivery matrix.
//!
//! Every route here is scoped to the CALLER. There is no admin view of someone
//! else's inbox and no way to name another account: the user id always comes
//! from the session, never from the request, so an id guessed from a link is a
//! no-op rather than a leak.
//!
//! Rows are stored as i18n keys and rendered here in the caller's language (see
//! `services::notify::render`), which is why reading is not a plain SELECT.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n;
use crate::model::{DeliveriesView, NotificationsView, PushTransport, SubscribeBody};
use crate::services::auth::random_token;
use crate::services::jobs::now_ms;
use crate::services::notify;
use crate::services::scan::short_hash;
use crate::state::SharedState;

mod inbox;
mod prefs;

// The store keeps 200 rows per user (`db::notifications::RETENTION_PER_USER`);
// the bell only ever shows a page.
const PAGE: usize = 50;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/deliveries", get(deliveries))
        .route("/notifications/read", post(inbox::read))
        .route("/notifications/unread", post(inbox::unread))
        .route("/notifications/seen", post(inbox::seen))
        .route("/notifications/archive", post(inbox::archive))
        .route("/notifications/archive/read", post(inbox::archive_read))
        .route("/notifications/unarchive", post(inbox::unarchive))
        .route("/notifications/{id}", axum::routing::delete(inbox::remove))
        .route("/notifications/{id}/interacted", post(inbox::interacted))
        .route(
            "/notifications/prefs",
            get(prefs::get_prefs).put(prefs::put_prefs),
        )
        .route("/push/key", get(push_key))
        .route("/push/subscribe", post(subscribe).delete(unsubscribe))
        .route("/push/test", post(push_test))
}

/// `GET /api/notifications` query. `archived=true` lists the rows the caller
/// put away instead of the inbox.
#[derive(Debug, Default, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub archived: bool,
}

/// `GET /api/notifications` the caller's inbox (or archive), newest first, plus
/// the unread tally and the unseen one that drives the bell badge.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(shelf): Query<ListQuery>,
) -> Result<Response, Response> {
    let locale = notify::render::locale_of(&user).to_string();
    let uid = user.id.clone();
    let types = notify::types::types_of(&state);
    let view = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let stored = if shelf.archived {
            db::notifications::list_archived(&conn, &uid, PAGE)?
        } else {
            db::notifications::list_notifications(&conn, &uid, PAGE, false)?
        };
        let unread = db::notifications::unread_count(&conn, &uid)?;
        let unseen = db::notifications::unseen_count(&conn, &uid)?;
        let subjects =
            notify::subject::Subjects::from(db::notifications::subject_facts(&conn, &stored)?);
        Ok(NotificationsView {
            notifications: stored
                .iter()
                .map(|s| notify::render::render(s, &locale, &subjects, &types))
                .collect(),
            unread,
            unseen,
        })
    })
    .await?;
    Ok(Json(view).into_response())
}

/// `GET /api/notifications/deliveries` what became of the caller's own pushes,
/// newest first, one record per attempt per device.
///
/// A record names the device by the label it chose and by the subscription it
/// was sent to. The endpoint, the device token and the relay grant are
/// credentials and are not in the answer.
pub async fn deliveries(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let view = query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(DeliveriesView {
            deliveries: db::notification_deliveries::deliveries_for_user(&conn, &uid, PAGE)?,
        })
    })
    .await?;
    Ok(Json(view).into_response())
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
    if body.transport == PushTransport::WebPush
        && !notify::push::accepts_web_push_endpoint(&body.endpoint)
    {
        return Err(lerr(
            i18n::user_locale(&user),
            StatusCode::BAD_REQUEST,
            "error.pushBadEndpoint",
        ));
    }
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
