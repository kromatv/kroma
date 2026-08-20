//! The account's own editable fields: username, email, languages and avatar.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::lerr;
use crate::api::util::{blocking, query};
use crate::api::extract::AuthUser;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::model::User;
use crate::state::SharedState;

const AVATAR_MAX_WIDTH: u32 = 512;

// Distinguishes an absent field (leave unchanged) from an explicit `null` (clear
// it), so `PATCH /auth/me` touches only the fields the client actually sent.
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

#[derive(Debug, Deserialize)]
pub struct UpdateMeBody {
    #[serde(default, deserialize_with = "double_option")]
    pub language: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub username: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub email: Option<Option<String>>,
    #[serde(rename = "audioLanguage", default, deserialize_with = "double_option")]
    pub audio_language: Option<Option<String>>,
    #[serde(rename = "subtitleLanguage", default, deserialize_with = "double_option")]
    pub subtitle_language: Option<Option<String>>,
}

// Media languages are free-form ISO codes, so unlike the UI `language` they are
// not constrained to the app's catalog.
fn norm_media_lang(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty())
}

/// `PATCH /api/auth/me` (Bearer) → `{ user }`. Only the fields present in the body
/// are touched; all persist server-side so they follow the account across devices.
pub async fn update_me(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(mut user): AuthUser,
    Json(body): Json<UpdateMeBody>,
) -> Response {
    if let Err(resp) = apply_username(&state, loc, &mut user, body.username).await {
        return resp;
    }
    if let Err(resp) = apply_email(&state, loc, &mut user, body.email).await {
        return resp;
    }
    if let Err(resp) = apply_language(&state, &mut user, body.language).await {
        return resp;
    }
    if let Err(resp) = apply_audio_language(&state, &mut user, body.audio_language).await {
        return resp;
    }
    if let Err(resp) = apply_subtitle_language(&state, &mut user, body.subtitle_language).await {
        return resp;
    }
    Json(json!({ "user": user })).into_response()
}

async fn apply_username(
    state: &SharedState,
    loc: &str,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(name) = field else { return Ok(()) };
    let name = name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "auth.usernameInvalid"));
    }
    let check = name.clone();
    let self_id = user.id.clone();
    match query(&state.db, move |pool| db::username_taken(&pool, &check, Some(&self_id))).await {
        Ok(true) => return Err(lerr(loc, StatusCode::CONFLICT, "auth.usernameTaken")),
        Ok(false) => {}
        Err(resp) => return Err(resp),
    }
    let uid = user.id.clone();
    let n = name.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_username(&pool, &uid, &n)).await {
        return Err(resp);
    }
    user.username = name;
    Ok(())
}

async fn apply_email(
    state: &SharedState,
    loc: &str,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(email) = field else { return Ok(()) };
    let email = email.unwrap_or_default().trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "auth.emailInvalid"));
    }
    let check = email.clone();
    match query(&state.db, move |pool| db::find_user_by_email(&pool, &check)).await {
        Ok(Some((other, _))) if other.id != user.id => {
            return Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"));
        }
        Ok(_) => {}
        Err(resp) => return Err(resp),
    }
    let uid = user.id.clone();
    let e = email.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_email(&pool, &uid, &e)).await {
        // A concurrent request can take the address between the check and the
        // write; re-confirm so the UNIQUE(email) failure surfaces as 409, not 500.
        let check = email.clone();
        let self_id = user.id.clone();
        if let Ok(Some((other, _))) =
            query(&state.db, move |pool| db::find_user_by_email(&pool, &check)).await
        {
            if other.id != self_id {
                return Err(lerr(loc, StatusCode::CONFLICT, "auth.emailTaken"));
            }
        }
        return Err(resp);
    }
    user.email = email;
    Ok(())
}

async fn store_user_lang<F>(
    state: &SharedState,
    user_id: &str,
    value: Option<String>,
    set: F,
) -> Result<Option<String>, Response>
where
    F: FnOnce(&db::Pool, &str, Option<&str>) -> anyhow::Result<()> + Send + 'static,
{
    let uid = user_id.to_string();
    let v = value.clone();
    query(&state.db, move |pool| set(&pool, &uid, v.as_deref())).await?;
    Ok(value)
}

async fn apply_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(lang) = field else { return Ok(()) };
    let language = lang.and_then(|tag| i18n::normalize(&tag)).map(|c| c.to_string());
    user.language = store_user_lang(state, &user.id, language, db::set_user_language).await?;
    Ok(())
}

async fn apply_audio_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(audio) = field else { return Ok(()) };
    let audio = norm_media_lang(audio);
    user.audio_language = store_user_lang(state, &user.id, audio, db::set_user_audio_language).await?;
    Ok(())
}

async fn apply_subtitle_language(
    state: &SharedState,
    user: &mut User,
    field: Option<Option<String>>,
) -> Result<(), Response> {
    let Some(sub) = field else { return Ok(()) };
    let sub = norm_media_lang(sub);
    user.subtitle_language = store_user_lang(state, &user.id, sub, db::set_user_subtitle_language).await?;
    Ok(())
}

/// `POST /api/users/avatar` (Bearer, body = raw `image/*`) → `{ avatarUrl }`.
pub async fn upload_avatar(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Response {
    if body.is_empty() {
        return lerr(loc, StatusCode::BAD_REQUEST, "error.emptyBody");
    }

    let data_dir = state.config.data_dir.clone();
    let bytes = body.to_vec();
    let url = match blocking(move || Ok(crate::infra::image::store_upload(&data_dir, &bytes, Some(AVATAR_MAX_WIDTH), ""))).await {
        Ok(Some(u)) => u,
        Ok(None) => return lerr(loc, StatusCode::UNSUPPORTED_MEDIA_TYPE, "error.imageUnreadable"),
        Err(resp) => return resp,
    };

    let uid = user.id.clone();
    let url_db = url.clone();
    if let Err(resp) = query(&state.db, move |pool| db::set_user_avatar(&pool, &uid, Some(&url_db))).await {
        return resp;
    }
    Json(json!({ "avatarUrl": url })).into_response()
}
