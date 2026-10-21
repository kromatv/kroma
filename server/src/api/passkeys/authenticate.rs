use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use webauthn_rs::prelude::{DiscoverableKey, PublicKeyCredential, Uuid};

use super::ceremony::{
    allowed_origins, parse_passkeys, relying_party, stash, take, user_uuid, Ceremony,
};
use crate::api::accounts::{device_hints, issue_tokens};
use crate::api::error::lerr;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::state::SharedState;

/// `POST /api/auth/passkeys/authenticate/start` → `{ ceremonyId, options }`. No
/// identifier: the challenge allows any of this server's passkeys, and the
/// browser lets the user pick which account to sign in as.
pub async fn authenticate_start(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
) -> Response {
    let webauthn = match relying_party(&headers, loc, &allowed_origins(&state)) {
        Ok(w) => w,
        Err(resp) => return resp,
    };
    match webauthn.start_discoverable_authentication() {
        Ok((rcr, auth)) => {
            let ceremony_id = stash(Ceremony::Discover { auth });
            Json(json!({ "ceremonyId": ceremony_id, "options": rcr })).into_response()
        }
        Err(_) => lerr(loc, StatusCode::BAD_REQUEST, "passkey.startFailed"),
    }
}

#[derive(Debug, Deserialize)]
pub struct AuthFinishBody {
    #[serde(rename = "ceremonyId")]
    pub ceremony_id: String,
    pub credential: PublicKeyCredential,
}

async fn account_for_handle(state: &SharedState, handle: Uuid) -> Option<String> {
    let ids = query(&state.db, |pool| db::passkey_user_ids(&pool))
        .await
        .ok()?;
    ids.into_iter().find(|id| user_uuid(id) == handle)
}

/// `POST /api/auth/passkeys/authenticate/finish` `{ ceremonyId, credential }` →
/// `{ token, accessToken, user }`, the same shape as password login.
pub async fn authenticate_finish(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    Json(body): Json<AuthFinishBody>,
) -> Response {
    let webauthn = match relying_party(&headers, loc, &allowed_origins(&state)) {
        Ok(w) => w,
        Err(resp) => return resp,
    };
    let Some(Ceremony::Discover { auth }) = take(&body.ceremony_id) else {
        return lerr(loc, StatusCode::BAD_REQUEST, "passkey.ceremonyExpired");
    };

    let Ok((handle, _)) = webauthn.identify_discoverable_authentication(&body.credential) else {
        return lerr(loc, StatusCode::UNAUTHORIZED, "passkey.authFailed");
    };
    let Some(user_id) = account_for_handle(&state, handle).await else {
        return lerr(loc, StatusCode::UNAUTHORIZED, "passkey.authFailed");
    };

    let uid = user_id.clone();
    let blobs = match query(&state.db, move |pool| db::passkey_credentials(&pool, &uid)).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let mut passkeys = parse_passkeys(&blobs);
    let keys: Vec<DiscoverableKey> = passkeys
        .iter()
        .map(|(_, pk)| DiscoverableKey::from(pk))
        .collect();
    let result = match webauthn.finish_discoverable_authentication(&body.credential, auth, &keys) {
        Ok(r) => r,
        Err(_) => return lerr(loc, StatusCode::UNAUTHORIZED, "passkey.authFailed"),
    };

    // Persist the matched credential's advanced counter (replay defence).
    // Best-effort: a DB hiccup shouldn't block an otherwise valid login.
    let matched = hex::encode(result.cred_id());
    if let Some((id, pk)) = passkeys.iter_mut().find(|(id, _)| *id == matched) {
        let changed = pk.update_credential(&result) == Some(true);
        let cred_json = if changed {
            serde_json::to_string(pk).ok()
        } else {
            None
        };
        let id_db = id.clone();
        let _ = query(&state.db, move |pool| {
            db::touch_passkey(&pool, &id_db, cred_json.as_deref())
        })
        .await;
    }

    let user = match query(&state.db, move |pool| db::user_by_id(&pool, &user_id)).await {
        Ok(Some(u)) => u,
        Ok(None) => return lerr(loc, StatusCode::UNAUTHORIZED, "passkey.authFailed"),
        Err(resp) => return resp,
    };
    issue_tokens(state, user, device_hints(&headers)).await
}
