//! Kids profiles as an admin makes them (ACCT-122 to ACCT-124), the notice
//! the other adults without a PIN get (ACCT-134), and the one change the
//! member editor may never make to one: a right beyond watching (ACCT-127).

use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use super::restrictions::MemberCall;
use super::{UpdateUserBody, library_scope, update_user};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{blocking, query};
use crate::db::{self, NewKidsProfile};
use crate::infra::events::ServerEvent;
use crate::model::{
    ActionKind, ActionSpec, ActionStyle, MaturityLevel, NotificationCategory, NotificationEvent,
    NotificationSpec, Permission, User,
};
use crate::services::notify;
use crate::state::SharedState;

const MAX_NAME_CHARS: usize = 64;

/// `level` has no default: the admin picks one of the kids levels (ACCT-123).
/// `libraries` is the grant, as for any account (ACCT-124).
#[derive(Debug, Deserialize)]
pub struct NewKidsBody {
    pub username: String,
    pub level: MaturityLevel,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
}

/// `POST /api/admin/kids` `{ username, level, libraries? }` → `{ user }`. A
/// level above 10+ or a name that is empty, too long or already taken is
/// refused with 400 or 409.
pub async fn create(
    State(state): State<SharedState>,
    AuthUser(admin): AuthUser,
    Json(body): Json<NewKidsBody>,
) -> Result<Response, Response> {
    super::super::require(&admin, Permission::UsersManage)?;
    let loc = super::super::user_locale(&admin);
    let (username, level) = valid_draft(&body, loc)?;
    let libraries = library_scope(body.libraries)
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "admin.tooManyLibraries"))?;
    name_is_free(&state, &username, loc).await?;
    let user = query(&state.db, move |pool| {
        let new = NewKidsProfile {
            username: &username,
            level,
            libraries: &libraries,
        };
        db::create_kids_profile(&pool, &new)
    })
    .await?;
    state.events.publish(ServerEvent::LibraryUpdated);
    tell_adults_without_a_pin(&state, &admin.id).await;
    Ok(Json(json!({ "user": user })).into_response())
}

async fn name_is_free(state: &SharedState, username: &str, loc: &str) -> Result<(), Response> {
    let taken = username.to_string();
    if query(&state.db, move |pool| db::username_taken(&pool, &taken, None)).await? {
        return Err(lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken"));
    }
    Ok(())
}

const SECURITY: &str = "/account?section=security&pin=set";

async fn tell_adults_without_a_pin(state: &SharedState, admin_id: &str) {
    let engine = state.clone();
    let admin_id = admin_id.to_string();
    let _ = blocking(move || {
        let adults = adults_without_a_pin(&engine, &admin_id)?;
        Ok(notify::emit_to(&engine, &adults, &pin_notice()))
    })
    .await;
}

fn adults_without_a_pin(state: &SharedState, admin_id: &str) -> anyhow::Result<Vec<User>> {
    let kids: HashSet<String> = db::kids_profiles(&state.db)?
        .into_iter()
        .map(|kid| kid.id)
        .collect();
    let everyone = db::notifications::recipients(&*state.db.get()?)?;
    Ok(everyone
        .into_iter()
        .filter(|user| user.id != admin_id && !user.has_pin && !kids.contains(&user.id))
        .collect())
}

fn pin_notice() -> NotificationSpec {
    NotificationSpec::new(
        NotificationEvent::Custom,
        "notifications.kids.created.title",
        "notifications.kids.created.body",
    )
    .in_category(NotificationCategory::System)
    .dedupe_key("kids.pin-offer")
    .link(SECURITY)
    .action(ActionSpec {
        id: "set-pin".into(),
        label_key: "notifications.action.setPin".into(),
        kind: ActionKind::Link,
        href: SECURITY.into(),
        method: None,
        style: ActionStyle::Primary,
    })
}

fn valid_draft(body: &NewKidsBody, loc: &str) -> Result<(String, MaturityLevel), Response> {
    let username = body.username.trim().to_string();
    let named = username.chars().count();
    if !body.level.is_kids() || named == 0 || named > MAX_NAME_CHARS {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "admin.kidsInvalid"));
    }
    Ok((username, body.level))
}

/// `PATCH /api/admin/users/:id`, refused with 409 when it would give a Kids
/// profile any right beyond watching (ACCT-127, ACCT-137).
pub async fn update_member(
    State(state): State<SharedState>,
    call: MemberCall,
    Json(body): Json<UpdateUserBody>,
) -> Result<Response, Response> {
    if gives_a_kid_a_right(&state, &call, &body).await? {
        let loc = super::super::user_locale(&call.admin);
        return Err(lerr(loc, StatusCode::CONFLICT, "admin.kidsOnlyWatch"));
    }
    update_user(
        State(state),
        AuthUser(call.admin),
        AxPath(call.id),
        Json(body),
    )
    .await
}

async fn gives_a_kid_a_right(
    state: &SharedState,
    call: &MemberCall,
    body: &UpdateUserBody,
) -> Result<bool, Response> {
    let watching = |right: &Permission| *right == Permission::Playback;
    if body
        .permissions
        .as_ref()
        .is_none_or(|rights| rights.iter().all(watching))
    {
        return Ok(false);
    }
    let id = call.id.clone();
    query(&state.db, move |pool| db::is_kids_profile(&pool, &id)).await
}
