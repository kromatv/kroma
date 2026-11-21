//! What an admin keeps from a profile: its maturity level (ACCT-109), set only
//! by an admin on another account (ACCT-115) after typing their own password
//! (ACCT-116).

use axum::Json;
use axum::extract::{FromRequestParts, Path as AxPath, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::pin::check_password;
use crate::api::util::query;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::{MaturityLevel, Permission, User};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct LevelBody {
    pub level: MaturityLevel,
    pub password: String,
}

/// The member a restrictions request names, asked by an account that manages
/// users. Rejects as [`AuthUser`] does, then as every member route does for a
/// caller without `users.manage`.
pub struct MemberCall {
    pub admin: User,
    pub id: String,
}

impl FromRequestParts<SharedState> for MemberCall {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(admin) = AuthUser::from_request_parts(parts, state).await?;
        super::super::require(&admin, Permission::UsersManage)?;
        let AxPath(id) = AxPath::<String>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        Ok(Self { admin, id })
    }
}

/// `GET /api/admin/users/:id/restrictions` → `{ level, held }`. `held` is
/// `false` for an account with a management right, which no ceiling binds.
pub async fn restrictions(
    State(state): State<SharedState>,
    MemberCall { admin, id }: MemberCall,
) -> Result<Response, Response> {
    let target = super::target_or_404(&state, &admin, &id).await?;
    let stored = query(&state.db, move |pool| db::profile_maturity(&pool, &id)).await?;
    Ok(Json(json!({ "level": stored.level, "held": !target.is_any_admin() })).into_response())
}

/// `PUT /api/admin/users/:id/restrictions/level` `{ level, password }` → 204.
/// Refused on the admin's own profile and, below 18+, on an account with a
/// management right. A wrong password counts toward the same cooldown a wrong
/// PIN does.
pub async fn set_level(
    State(state): State<SharedState>,
    MemberCall { admin, id }: MemberCall,
    Json(body): Json<LevelBody>,
) -> Result<Response, Response> {
    let loc = super::super::user_locale(&admin);
    if id == admin.id {
        return Err(lerr(
            loc,
            StatusCode::FORBIDDEN,
            "admin.restrictionsOwnProfile",
        ));
    }
    let target = super::target_or_404(&state, &admin, &id).await?;
    refuse_an_admin(&target, body.level, loc)?;
    check_password(&state, &admin.id, &body.password, loc).await?;
    let level = body.level;
    query(&state.db, move |pool| {
        db::set_maturity_level(&pool, &id, level)
    })
    .await?;
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(StatusCode::NO_CONTENT.into_response())
}

fn refuse_an_admin(target: &User, level: MaturityLevel, loc: &str) -> Result<(), Response> {
    if target.is_any_admin() && level != MaturityLevel::Adult {
        return Err(lerr(loc, StatusCode::CONFLICT, "admin.restrictionsAdmin"));
    }
    Ok(())
}
