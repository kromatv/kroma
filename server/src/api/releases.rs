//! `/api/releases`: the notes of every release this server has reached, in the
//! caller's language, and the one release the caller has not been shown yet.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::user_locale;
use crate::model::{Permission, ReleasesView};
use crate::services::releases;
use crate::state::SharedState;

const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/releases", get(list))
        .route("/releases/seen", post(seen))
}

pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let owner = user.can(Permission::SettingsManage);
    let shown = releases::view(
        releases::embedded(),
        SERVER_VERSION,
        user_locale(&user),
        owner,
    );
    let uid = user.id.clone();
    let seen = query(&state.db, move |pool| db::whats_new_seen(&pool, &uid)).await?;
    let unseen = releases::unseen(&shown, seen.as_deref());
    Ok(Json(ReleasesView {
        current: SERVER_VERSION.to_owned(),
        unseen,
        releases: shown,
    })
    .into_response())
}

#[derive(Debug, Deserialize)]
pub struct SeenBody {
    version: String,
}

pub async fn seen(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SeenBody>,
) -> Result<Response, Response> {
    let version = body.version.trim().to_owned();
    let reached = releases::version_key(&version)
        .is_some_and(|key| Some(key) <= releases::version_key(SERVER_VERSION));
    if !reached {
        return Err(StatusCode::BAD_REQUEST.into_response());
    }
    let uid = user.id.clone();
    query(&state.db, move |pool| {
        db::set_whats_new_seen(&pool, &uid, &version)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
