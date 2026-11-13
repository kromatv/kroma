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

use crate::api::dto::{Discovered, MethodView, ProviderView, SignInAdmin};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::sso::{self, sign_in_config, CALLBACK_PATH};
use crate::api::util::blocking;
use crate::i18n::ReqLocale;
use crate::model::Permission;
use crate::services::settings::{
    self, Method, Provider, SignIn, SignInRefused, PASSKEY_ID, PASSWORD_ID,
};
use crate::services::sso::discovery::{discover, fetch_keys};
use crate::services::sso::flows::Intent;
use crate::state::SharedState;

mod image;
mod input;

use input::{methods_from, MethodInput};

const MAX_PROVIDERS: usize = 8;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/sign-in", get(get_sign_in).put(save_sign_in))
        .route("/sign-in/discover", post(discover_provider))
        .route("/sign-in/test", post(test_provider))
        .merge(image::routes())
}

fn provider_view(p: Provider) -> ProviderView {
    ProviderView {
        image: sso::method_image(&p),
        has_image: !p.image.is_empty(),
        has_secret: !p.client_secret.is_empty(),
        tested: p.is_tested(),
        live: p.is_live(),
        id: p.id,
        enabled: p.enabled,
        label: p.label,
        preset: p.preset,
        icon: p.icon,
        issuer: p.issuer,
        client_id: p.client_id,
        scopes: p.scopes,
        group_claim: p.group_claim,
        required_groups: p.required_groups,
        new_people: p.new_people,
        permissions: p.permissions,
        libraries: p.libraries,
        from_env: p.from_env,
    }
}

fn method_view(method: Method) -> MethodView {
    match method {
        Method::Password(on) => MethodView::Password {
            id: PASSWORD_ID,
            enabled: on.enabled,
        },
        Method::Passkey(on) => MethodView::Passkey {
            id: PASSKEY_ID,
            enabled: on.enabled,
        },
        Method::Oidc(provider) => MethodView::Oidc(Box::new(provider_view(*provider))),
    }
}

/// The redirect URIs to register at a provider: one per origin the operator
/// named. Empty when they named none: the redirect URI is then the callback
/// under whatever origin the browser is on.
fn redirect_uris(state: &SharedState) -> Vec<String> {
    crate::api::passkeys::allowed_origins(state)
        .into_iter()
        .map(|origin| format!("{origin}{CALLBACK_PATH}"))
        .collect()
}

/// `GET /api/admin/sign-in` → the methods in order, secrets left out.
pub async fn get_sign_in(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    Ok(Json(SignInAdmin {
        methods: sign_in_config(&state)
            .methods
            .into_iter()
            .map(method_view)
            .collect(),
        redirect_uris: redirect_uris(&state),
    })
    .into_response())
}

#[derive(Deserialize)]
pub struct SignInSaveBody {
    pub methods: Vec<MethodInput>,
}

/// `PUT /api/admin/sign-in` `{ methods }` → 204. The list is the order the
/// sign-in screen offers them in. `409` when the change would leave nobody
/// new able to come in.
pub async fn save_sign_in(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(body): Json<SignInSaveBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let providers = body
        .methods
        .iter()
        .filter(|m| matches!(m, MethodInput::Oidc(_)))
        .count();
    if providers > MAX_PROVIDERS {
        return Err(lerr(loc, StatusCode::BAD_REQUEST, "sso.tooManyProviders"));
    }
    let env = state.config.sign_in_provider.as_ref();
    let methods = methods_from(body.methods, env.is_some())
        .map_err(|key| lerr(loc, StatusCode::BAD_REQUEST, key))?;
    let before = sign_in_config(&state);
    match settings::set_sign_in(&state.settings, &state.db, env, SignIn { methods }) {
        Ok(()) => {
            image::drop_orphans(&state, &before).await;
            Ok(StatusCode::NO_CONTENT.into_response())
        }
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
    let from_this_page = sso::FlowClient::default();
    Ok(sso::begin(&state, loc, &headers, &addr, &body.provider, intent, &from_this_page).await)
}
