//! WebAuthn passkeys: register credentials (authenticated) and sign in with them
//! (public, passwordless). The relying party is derived per-request from the
//! `Origin` header — each passkey is bound to the origin it was created on.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use webauthn_rs::prelude::{
    CredentialID, DiscoverableAuthentication, DiscoverableKey, Passkey, PasskeyRegistration,
    PublicKeyCredential, RegisterPublicKeyCredential, Url, Uuid, Webauthn, WebauthnBuilder,
};

use crate::api::accounts::{issue_tokens, user_agent};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::{self, ReqLocale};
use crate::services::auth;
use crate::state::SharedState;

/// The `/auth/me/*` routes self-gate via [`AuthUser`]; the
/// `/auth/passkeys/authenticate/*` pair is public (it *is* the login).
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/me/passkeys", get(list))
        .route("/auth/me/passkeys/{id}", axum::routing::delete(remove))
        .route("/auth/me/passkeys/register/start", post(register_start))
        .route("/auth/me/passkeys/register/finish", post(register_finish))
        .route(
            "/auth/passkeys/authenticate/start",
            post(authenticate_start),
        )
        .route(
            "/auth/passkeys/authenticate/finish",
            post(authenticate_finish),
        )
}

const CEREMONY_TTL_SECS: i64 = 300;

enum Ceremony {
    Register {
        user_id: String,
        reg: PasskeyRegistration,
    },
    Discover {
        auth: DiscoverableAuthentication,
    },
}

struct Entry {
    expires: i64,
    ceremony: Ceremony,
}

static CEREMONIES: LazyLock<Mutex<HashMap<String, Entry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn stash(ceremony: Ceremony) -> String {
    let id = auth::random_token();
    if let Ok(mut m) = CEREMONIES.lock() {
        let n = now();
        m.retain(|_, e| e.expires > n);
        m.insert(
            id.clone(),
            Entry {
                expires: n + CEREMONY_TTL_SECS,
                ceremony,
            },
        );
    }
    id
}

fn take(id: &str) -> Option<Ceremony> {
    let mut m = CEREMONIES.lock().ok()?;
    let e = m.remove(id)?;
    (e.expires > now()).then_some(e.ceremony)
}

// Deterministic, so re-registration keeps the same WebAuthn user handle.
fn user_uuid(user_id: &str) -> Uuid {
    Uuid::new_v5(&Uuid::NAMESPACE_OID, user_id.as_bytes())
}

fn relying_party(headers: &HeaderMap, loc: &str) -> Result<Webauthn, Response> {
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originMissing"))?;
    let url = Url::parse(origin)
        .map_err(|_| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?;
    let rp_id = url
        .host_str()
        .ok_or_else(|| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))?
        .to_string();
    WebauthnBuilder::new(&rp_id, &url)
        .and_then(|b| b.allow_any_port(true).rp_name("KROMA").build())
        .map_err(|_| lerr(loc, StatusCode::BAD_REQUEST, "passkey.originInvalid"))
}

fn parse_passkeys(blobs: &[String]) -> Vec<(String, Passkey)> {
    blobs
        .iter()
        .filter_map(|j| serde_json::from_str::<Passkey>(j).ok())
        .map(|pk| (hex::encode(pk.cred_id()), pk))
        .collect()
}

/// `POST /api/auth/me/passkeys/register/start` (Bearer) → `{ ceremonyId, options }`,
/// where `options` feeds `navigator.credentials.create`.
pub async fn register_start(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
    AuthUser(user): AuthUser,
) -> Response {
    let webauthn = match relying_party(&headers, loc) {
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
        Ok((ccr, reg)) => {
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
    let webauthn = match relying_party(&headers, loc) {
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
    Json(super::dto::PasskeyInfo {
        id,
        name,
        created_at,
        last_used: None,
    })
    .into_response()
}

/// `GET /api/auth/me/passkeys` (Bearer) → `PasskeyInfo[]`, newest first.
pub async fn list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::list_passkeys(&pool, &uid)).await {
        Ok(rows) => {
            let out: Vec<super::dto::PasskeyInfo> = rows
                .into_iter()
                .map(|r| super::dto::PasskeyInfo {
                    id: r.id,
                    name: r.name,
                    created_at: r.created_at,
                    last_used: r.last_used,
                })
                .collect();
            Json(out).into_response()
        }
        Err(resp) => resp,
    }
}

/// `DELETE /api/auth/me/passkeys/:id` (Bearer) → 204, or `404` if the id does
/// not belong to the caller.
pub async fn remove(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Response {
    let uid = user.id.clone();
    match query(&state.db, move |pool| db::delete_passkey(&pool, &uid, &id)).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => lerr(loc, StatusCode::NOT_FOUND, "passkey.notFound"),
        Err(resp) => resp,
    }
}

/// `POST /api/auth/passkeys/authenticate/start` → `{ ceremonyId, options }`. No
/// identifier: the challenge allows any of this server's passkeys, and the
/// browser lets the user pick which account to sign in as.
pub async fn authenticate_start(
    State(_state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    headers: HeaderMap,
) -> Response {
    let webauthn = match relying_party(&headers, loc) {
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
    let webauthn = match relying_party(&headers, loc) {
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
    issue_tokens(state, user, user_agent(&headers)).await
}
