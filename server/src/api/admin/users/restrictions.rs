//! What an admin keeps from a profile: its maturity level (ACCT-109) and the
//! titles blocked or allowed for it (ACCT-117 to ACCT-120). Only an admin
//! sets them, never on their own profile (ACCT-115), and each change carries
//! that admin's own password (ACCT-116, ACCT-121).

use std::collections::HashMap;

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
use crate::db::{self, RuledTitle};
use crate::infra::events::ServerEvent;
use crate::model::{MaturityLevel, Permission, TitleRule, User};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct LevelBody {
    pub level: MaturityLevel,
    pub password: String,
}

/// `rule` is `null` to lift whichever rule the title carries.
#[derive(Debug, Deserialize)]
pub struct RuleBody {
    pub rule: Option<TitleRule>,
    pub password: String,
}

/// The member a restrictions request names, and the title when the route
/// names one, asked by an account that manages users. Rejects as [`AuthUser`]
/// does, then as every member route does for a caller without `users.manage`.
pub struct MemberCall {
    pub admin: User,
    pub id: String,
    pub title: Option<String>,
}

impl FromRequestParts<SharedState> for MemberCall {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(admin) = AuthUser::from_request_parts(parts, state).await?;
        super::super::require(&admin, Permission::UsersManage)?;
        let AxPath(mut named) = AxPath::<HashMap<String, String>>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        Ok(Self {
            id: named.remove("id").unwrap_or_default(),
            title: named.remove("title"),
            admin,
        })
    }
}

/// `GET /api/admin/users/:id/restrictions` → `{ level, held, titles }`.
/// `held` is `false` for an account with a management right, which neither a
/// ceiling nor a block binds; `titles` lists every blocked or allowed title,
/// newest first.
pub async fn restrictions(
    State(state): State<SharedState>,
    MemberCall { admin, id, .. }: MemberCall,
) -> Result<Response, Response> {
    let target = super::target_or_404(&state, &admin, &id).await?;
    let (stored, ruled) = query(&state.db, move |pool| {
        Ok((
            db::profile_maturity(&pool, &id)?,
            db::ruled_titles(&pool, &id)?,
        ))
    })
    .await?;
    let titles: Vec<serde_json::Value> = ruled.iter().map(ruled_json).collect();
    let held = !target.is_any_admin();
    Ok(Json(json!({ "level": stored.level, "held": held, "titles": titles })).into_response())
}

/// `PUT /api/admin/users/:id/restrictions/level` `{ level, password }` → 204.
/// Refused on the admin's own profile and, below 18+, on an account with a
/// management right. A wrong password counts toward the same cooldown a wrong
/// PIN does.
pub async fn set_level(
    State(state): State<SharedState>,
    call: MemberCall,
    Json(body): Json<LevelBody>,
) -> Result<Response, Response> {
    let restricts = body.level != MaturityLevel::Adult;
    proven(
        &state,
        &call,
        Change {
            password: &body.password,
            restricts,
        },
    )
    .await?;
    let (id, level) = (call.id, body.level);
    query(&state.db, move |pool| {
        db::set_maturity_level(&pool, &id, level)
    })
    .await?;
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `PUT /api/admin/users/:id/restrictions/titles/:title` `{ rule, password }`
/// → 204. Blocks or allows a film or a show for the profile, replacing the
/// rule it had (ACCT-119); a show's rule covers its episodes. An episode or an
/// unknown title answers 404. Refused as [`set_level`] is.
pub async fn set_title_rule(
    State(state): State<SharedState>,
    call: MemberCall,
    Json(body): Json<RuleBody>,
) -> Result<Response, Response> {
    let title = whole_title(&state, &call).await?;
    let restricts = body.rule.is_some();
    proven(
        &state,
        &call,
        Change {
            password: &body.password,
            restricts,
        },
    )
    .await?;
    let (id, rule) = (call.id, body.rule);
    query(&state.db, move |pool| {
        db::set_title_rule(&pool, (&id, &title), rule)
    })
    .await?;
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn whole_title(state: &SharedState, call: &MemberCall) -> Result<String, Response> {
    let title = call.title.clone().unwrap_or_default();
    let named = vec![title.clone()];
    let found = query(&state.db, move |pool| db::subjects_access(&pool, &named)).await?;
    if found
        .get(&title)
        .is_some_and(|access| access.title == title)
    {
        return Ok(title);
    }
    let loc = super::super::user_locale(&call.admin);
    Err(lerr(loc, StatusCode::NOT_FOUND, "error.itemNotFound"))
}

struct Change<'a> {
    password: &'a str,
    restricts: bool,
}

async fn proven(
    state: &SharedState,
    call: &MemberCall,
    change: Change<'_>,
) -> Result<(), Response> {
    let loc = super::super::user_locale(&call.admin);
    if call.id == call.admin.id {
        return Err(lerr(
            loc,
            StatusCode::FORBIDDEN,
            "admin.restrictionsOwnProfile",
        ));
    }
    let target = super::target_or_404(state, &call.admin, &call.id).await?;
    if target.is_any_admin() && change.restricts {
        return Err(lerr(loc, StatusCode::CONFLICT, "admin.restrictionsAdmin"));
    }
    check_password(state, &call.admin.id, change.password, loc).await
}

fn ruled_json(title: &RuledTitle) -> serde_json::Value {
    let kind = if title.show { "show" } else { "movie" };
    json!({ "id": title.id, "name": title.name, "kind": kind, "rule": title.rule })
}
