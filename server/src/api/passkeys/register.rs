use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use webauthn_rs::prelude::{CredentialID, RegisterPublicKeyCredential};

use super::ceremony::{
    allowed_origins, parse_passkeys, relying_party, require_discoverable, stash, take, user_uuid,
    Ceremony,
};
use crate::api::dto::PasskeyInfo;
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::state::SharedState;

/// `POST /api/auth/me/passkeys/register/start` (Bearer) → `{ ceremonyId, options }`,
/// where `options` feeds `navigator.credentials.create`.
pub async fn register_start(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    AuthUser(user): AuthUser,
) -> Response {
    let webauthn = match relying_party(&headers, loc, &allowed_origins(&state)) {
        Ok(w) => w,
        Err(resp) => return resp,
    };
    // Exclude the account's existing credentials so the same authenticator can't
    // be enrolled twice.
    let uid = user.id.clone();
    let blobs = match query(&state.db, move |pool| db::passkey_credentials(&pool, &uid)).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let exclude: Vec<CredentialID> = parse_passkeys(&blobs)
        .into_iter()
        .map(|(_, pk)| pk.cred_id().clone())
        .collect();
    let exclude = (!exclude.is_empty()).then_some(exclude);

    match webauthn.start_passkey_registration(
        user_uuid(&user.id),
        &user.username,
        &user.username,
        exclude,
    ) {
        Ok((mut ccr, reg)) => {
            require_discoverable(&mut ccr);
            let ceremony_id = stash(Ceremony::Register {
                user_id: user.id,
                reg,
            });
            Json(json!({ "ceremonyId": ceremony_id, "options": ccr })).into_response()
        }
        Err(_) => lerr(loc, StatusCode::BAD_REQUEST, "passkey.startFailed"),
    }
}

#[derive(Debug, Deserialize)]
pub struct RegisterFinishBody {
    #[serde(rename = "ceremonyId")]
    pub ceremony_id: String,
    #[serde(default)]
    pub name: String,
    pub credential: RegisterPublicKeyCredential,
}

/// `POST /api/auth/me/passkeys/register/finish` (Bearer) → `{ id, name }`.
pub async fn register_finish(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    AuthUser(user): AuthUser,
    Json(body): Json<RegisterFinishBody>,
) -> Response {
    let webauthn = match relying_party(&headers, loc, &allowed_origins(&state)) {
        Ok(w) => w,
        Err(resp) => return resp,
    };
    let Some(Ceremony::Register { user_id, reg }) = take(&body.ceremony_id) else {
        return lerr(loc, StatusCode::BAD_REQUEST, "passkey.ceremonyExpired");
    };
    // A ceremony is bound to the account that started it.
    if user_id != user.id {
        return lerr(loc, StatusCode::FORBIDDEN, "passkey.ceremonyExpired");
    }

    let passkey = match webauthn.finish_passkey_registration(&body.credential, &reg) {
        Ok(pk) => pk,
        Err(_) => return lerr(loc, StatusCode::BAD_REQUEST, "passkey.registerFailed"),
    };
    let id = hex::encode(passkey.cred_id());
    let cred_json = match serde_json::to_string(&passkey) {
        Ok(j) => j,
        Err(_) => return lerr(loc, StatusCode::INTERNAL_SERVER_ERROR, "error.internal"),
    };
    let name = {
        let n = body.name.trim();
        if n.is_empty() {
            i18n::t(loc, "passkey.defaultName", &[])
        } else {
            n.to_string()
        }
    };

    let (uid, id_db, name_db, cred_db) = (user.id.clone(), id.clone(), name.clone(), cred_json);
    let created_at = match query(&state.db, move |pool| {
        db::insert_passkey(&pool, &id_db, &uid, &name_db, &cred_db)
    })
    .await
    {
        Ok(ts) => ts,
        Err(resp) => return resp,
    };
    Json(PasskeyInfo {
        id,
        name,
        created_at,
        last_used: None,
    })
    .into_response()
}
