//! A Kids profile opened from a device's picker (ACCT-126). It has no
//! credential, so the device presents the access token of a member signed in
//! on it, and the server mints the Kids profile a session bound to that same
//! device.

use axum::Json;
use axum::Router;
use axum::extract::{DefaultBodyLimit, FromRequestParts, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use serde::Deserialize;
use serde_json::json;

use super::{ThisDevice, auth_result};
use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db::{self, KidsProfile};
use crate::model::User;
use crate::state::SharedState;

const MAX_BODY_BYTES: usize = 4 * 1024;

pub(super) fn routes() -> Router<SharedState> {
    Router::new()
        .route("/kids/list", post(list))
        .route("/kids/open", post(open))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceBody {
    pub access_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBody {
    pub access_token: String,
    pub profile: String,
}

/// `POST /api/kids/list` `{ accessToken }` → `{ profiles }`, the server's Kids
/// profiles for a device a member is signed in on. A token that is unknown,
/// lapsed or a Kids profile's own answers 401.
pub async fn list(
    State(state): State<SharedState>,
    Json(body): Json<DeviceBody>,
) -> Result<Response, Response> {
    member_of(&state, body.access_token).await?;
    let profiles = query(&state.db, move |pool| db::kids_profiles(&pool)).await?;
    let listed: Vec<serde_json::Value> = profiles.iter().map(profile_json).collect();
    Ok(Json(json!({ "profiles": listed })).into_response())
}

/// `POST /api/kids/open` `{ accessToken, profile }` → the sign-in result of
/// the Kids profile `profile`, its session bound to this device and listed in
/// its devices like any other. 404 for an id that is no Kids profile.
pub async fn open(
    State(state): State<SharedState>,
    ThisDevice(hints): ThisDevice,
    Json(body): Json<OpenBody>,
) -> Result<Response, Response> {
    member_of(&state, body.access_token).await?;
    let id = body.profile;
    let kid = query(&state.db, move |pool| {
        Ok(match db::is_kids_profile(&pool, &id)? {
            true => db::user_by_id(&pool, &id)?,
            false => None,
        })
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "profile not found"))?;
    Ok(Json(auth_result(&state, kid, hints).await?).into_response())
}

async fn member_of(state: &SharedState, access: String) -> Result<User, Response> {
    let found = query(&state.db, move |pool| {
        let Some((user, _)) = db::access_token_user(&pool, &access)? else {
            return Ok(None);
        };
        let kids = db::is_kids_profile(&pool, &user.id)?;
        Ok((!kids).then_some(user))
    })
    .await?;
    found.ok_or_else(|| {
        json_error(
            StatusCode::UNAUTHORIZED,
            "a member's credential is required",
        )
    })
}

fn profile_json(profile: &KidsProfile) -> serde_json::Value {
    json!({ "id": profile.id, "username": profile.username, "avatarUrl": profile.avatar_url })
}

/// The session's account when it is not a Kids profile. A Kids profile signs
/// in by no means (ACCT-125), so its session may neither vouch for another
/// device nor take a credential of its own; it answers 403 where a member's
/// session would pass. Otherwise rejects as [`crate::api::extract::AuthUser`]
/// does.
pub struct AuthMember(pub User);

impl FromRequestParts<SharedState> for AuthMember {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        let id = user.id.clone();
        if query(&state.db, move |pool| db::is_kids_profile(&pool, &id)).await? {
            return Err(json_error(
                StatusCode::FORBIDDEN,
                "a Kids profile cannot do this",
            ));
        }
        Ok(AuthMember(user))
    }
}
