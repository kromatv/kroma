//! Join requests (`/api/admin/join-requests*`): the people a provider vouched
//! for who are waiting to be let in, and the ones an admin declined.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::dto::{JoinRequestView, JoinRequests};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::sso::{provider_name, sign_in_config};
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::infra::events::ServerEvent;
use crate::model::Permission;
use crate::services::sso::admit::{approve, free_username, Approval, Approved};
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/join-requests", get(list))
        .route("/join-requests/{id}", delete(remove))
        .route("/join-requests/{id}/approve", post(approve_request))
        .route("/join-requests/{id}/decline", post(decline))
}

/// `GET /api/admin/join-requests` → `{ waiting, declined }`, oldest first. A
/// waiting request's `username` is a name no account has yet, ready to be
/// approved as it stands.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::UsersManage)?;
    let config = sign_in_config(&state);
    let (waiting, declined) = query(&state.db, |pool| {
        let mut waiting = db::list_join_requests(&pool, false)?;
        for request in &mut waiting {
            request.username = free_username(&pool, &request.username)?;
        }
        Ok((waiting, db::list_join_requests(&pool, true)?))
    })
    .await?;
    let view = |request: db::JoinRequest| JoinRequestView {
        provider: provider_name(&config, &request.issuer),
        id: request.id,
        username: request.username,
        email: request.email,
        name: request.name,
        created_at: request.created_at,
    };
    Ok(Json(JoinRequests {
        waiting: waiting.into_iter().map(view).collect(),
        declined: declined.into_iter().map(view).collect(),
    })
    .into_response())
}

#[derive(Deserialize)]
pub struct ApproveBody {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub permissions: Option<Vec<Permission>>,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
}

/// `POST /api/admin/join-requests/:id/approve` `{ username?, permissions?,
/// libraries? }` → `{ user }`. The account signs in as the identity that
/// asked. `409` when the email or the typed username is taken.
pub async fn approve_request(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ApproveBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::UsersManage)?;
    let libraries = super::users::library_scope(body.libraries)
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "admin.tooManyLibraries"))?;
    let permissions = body
        .permissions
        .unwrap_or_else(|| vec![Permission::Playback]);
    let approved = query(&state.db, move |pool| {
        let approved = approve(
            &pool,
            &id,
            &Approval {
                username: body.username.as_deref(),
                permissions: &permissions,
                libraries: &libraries,
            },
        )?;
        if let Approved::Member(member) = &approved {
            db::set_whats_new_seen(&pool, &member.id, crate::VERSION)?;
        }
        Ok(approved)
    })
    .await?;
    match approved {
        Approved::Member(member) => {
            state.events.publish(ServerEvent::LibraryUpdated);
            Ok(Json(serde_json::json!({ "user": member })).into_response())
        }
        Approved::Gone => Err(lerr(loc, StatusCode::NOT_FOUND, "sso.requestUnknown")),
        Approved::EmailTaken => Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken")),
        Approved::UsernameTaken => Err(lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken")),
    }
}

/// `POST /api/admin/join-requests/:id/decline` → 204. The identity cannot ask
/// again until the declined request is removed.
pub async fn decline(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    super::require(&user, Permission::UsersManage)?;
    if query(&state.db, move |pool| db::block_join_request(&pool, &id)).await? {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Err(lerr(loc, StatusCode::NOT_FOUND, "sso.requestUnknown"))
    }
}

/// `DELETE /api/admin/join-requests/:id` → 204. Forgets a request, waiting or
/// declined, which lets a declined identity ask again.
pub async fn remove(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    super::require(&user, Permission::UsersManage)?;
    if query(&state.db, move |pool| db::delete_join_request(&pool, &id)).await? {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Err(lerr(loc, StatusCode::NOT_FOUND, "sso.requestUnknown"))
    }
}
