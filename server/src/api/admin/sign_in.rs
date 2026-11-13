//! Sign-in admin API (`/api/admin/sign-in*`): which methods are on, the
//! providers an operator added, reading a provider's address before saving it,
//! and the test sign-in that takes a provider live.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::dto::{Discovered, ProviderView, SignInAdmin};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::sso::{self, sign_in_config, CALLBACK_PATH};
use crate::api::util::blocking;
use crate::i18n::ReqLocale;
use crate::model::Permission;
use crate::services::settings::{self, Provider, SignIn, SignInRefused, ENV_PROVIDER_ID};
use crate::services::sso::discovery::{discover, fetch_keys};
use crate::services::sso::flows::Intent;
use crate::state::SharedState;

mod input;

use input::{provider_from, with_ids, ProviderInput};

const MAX_PROVIDERS: usize = 8;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/sign-in", get(get_sign_in).put(save_sign_in))
        .route("/sign-in/discover", post(discover_provider))
        .route("/sign-in/test", post(test_provider))
}

fn provider_view(p: Provider) -> ProviderView {
    ProviderView {
        has_secret: !p.client_secret.is_empty(),
        tested: p.is_tested(),
        live: p.is_live(),
        id: p.id,
        label: p.label,
        icon: p.icon,
        issuer: p.issuer,
        client_id: p.client_id,
        scopes: p.scopes,
        group_claim: p.group_claim,
        required_groups: p.required_groups,
        new_people: p.new_people,
        permissions: p.permissions,
        libraries: p.libraries,
        enabled: p.enabled,
        from_env: p.from_env,
    }
}

/// The redirect URIs to register at a provider: one per origin the operator
/// named, or the one this page was opened on when they named none.
fn redirect_uris(state: &SharedState, headers: &HeaderMap) -> Vec<String> {
    let mut origins = crate::api::passkeys::allowed_origins(state);
    if origins.is_empty() {
        origins.extend(sso::request_origin(state, headers));
    }
    origins
        .into_iter()
        .map(|origin| format!("{origin}{CALLBACK_PATH}"))
        .collect()
}

/// `GET /api/admin/sign-in` → the configuration, secrets left out.
pub async fn get_sign_in(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let config = sign_in_config(&state);
    Ok(Json(SignInAdmin {
        password: config.password,
        passkeys: config.passkeys,
        providers: config.providers.into_iter().map(provider_view).collect(),
        redirect_uris: redirect_uris(&state, &headers),
    })
    .into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInSaveBody {
    pub password: bool,
    pub passkeys: bool,
    pub providers: Vec<ProviderInput>,
}

/// `PUT /api/admin/sign-in` → 204. `409` when the change would leave nobody
/// new able to come in.
pub async fn save_sign_in(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(body): Json<SignInSaveBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    if body.providers.len() > MAX_PROVIDERS {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "sso.tooManyProviders"));
    }
    let env = state.config.sign_in_provider.as_ref();
    let providers = body
        .providers
        .into_iter()
        .map(|input| {
            let from_env = env.is_some() && input.id.trim() == ENV_PROVIDER_ID;
            provider_from(input, from_env)
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|key| lerr(loc, StatusCode::BAD_REQUEST, key))?;
    let incoming = SignIn {
        password: body.password,
        passkeys: body.passkeys,
        providers: with_ids(providers),
    };
    match settings::set_sign_in(&state.settings, &state.db, env, incoming) {
        Ok(()) => Ok(StatusCode::NO_CONTENT.into_response()),
        Err(SignInRefused::PasswordNeedsProvider) => {
            Err(lerr(loc, StatusCode::CONFLICT, "sso.passwordNeedsProvider"))
        }
        Err(SignInRefused::DuplicateProvider) => {
            Err(lerr(loc, StatusCode::BAD_REQUEST, "sso.providerInvalid"))
        }
    }
}

#[derive(Deserialize)]
pub struct DiscoverBody {
    pub issuer: String,
}

/// `POST /api/admin/sign-in/discover` `{ issuer }` → `{ ok, issuer?, scopes?,
/// reason? }`. Reads the address an admin is typing, before anything is saved.
pub async fn discover_provider(
    AuthUser(user): AuthUser,
    Json(body): Json<DiscoverBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let read = blocking(move || {
        Ok(discover(&body.issuer).and_then(|metadata| {
            fetch_keys(&metadata)?;
            Ok(metadata)
        }))
    })
    .await?;
    Ok(Json(match read {
        Ok(metadata) => Discovered {
            ok: true,
            issuer: Some(metadata.issuer),
            scopes: Some(metadata.scopes_supported),
            reason: None,
        },
        Err(e) => {
            tracing::warn!(error = ?e, "sign-in provider address unreadable");
            Discovered {
                ok: false,
                issuer: None,
                scopes: None,
                reason: Some(e.code()),
            }
        }
    })
    .into_response())
}

#[derive(Deserialize)]
pub struct TestBody {
    pub provider: String,
}

/// `POST /api/admin/sign-in/test` `{ provider }` → a flow, as a sign-in start
/// returns. The admin goes through the provider for real; a flow that comes
/// back verified takes the provider live and shows what the provider said
/// about them. Nobody is admitted by it.
pub async fn test_provider(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<TestBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let intent = Intent::Test { user_id: user.id };
    Ok(sso::begin(&state, loc, &headers, &addr, &body.provider, intent).await)
}
