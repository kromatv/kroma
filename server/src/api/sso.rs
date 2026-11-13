//! Signing in through an OpenID Connect provider. A client starts a flow and
//! keeps its secret, the person goes to the provider and comes back through
//! [`callback`], and the client collects with the secret and the code the
//! browser carried home. Neither half redeems anything without the other.

use axum::http::HeaderMap;
use axum::routing::{delete, get, post};
use axum::Router;
use kroma_http::address::web_target;

use crate::api::dto::{GateMethod, SignInMethods};
use crate::services::settings::{self, Method, Provider, SignIn, PASSKEY_ID, PASSWORD_ID};
use crate::services::sso::discovery::same_issuer;
use crate::state::SharedState;

mod begin;
mod callback;
mod finish;
mod identities;
mod image;

pub(crate) use begin::{begin, FlowClient};
pub(crate) use image::{method_brand, method_image, preset_views};
pub(crate) use identities::has_a_way_in;

/// The callback's path under an origin, which is what a provider is given as
/// this server's redirect URI.
pub(crate) const CALLBACK_PATH: &str = "/api/auth/sso/callback";

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/sso/start", post(begin::start))
        .route("/auth/sso/callback", get(callback::callback))
        .route("/auth/sso/finish", post(finish::finish))
        .route("/auth/sso/claim", post(identities::claim))
        .route(
            "/auth/me/identities",
            get(identities::list).post(begin::link),
        )
        .route("/auth/me/identities/{id}", delete(identities::unlink))
        .route("/auth/logos/{preset}/{file}", get(image::logo))
}

pub(crate) fn sign_in_config(state: &SharedState) -> SignIn {
    settings::sign_in(&state.settings, state.config.sign_in_provider.as_ref())
}

/// The methods a person can use right now, in the admin's order: a built-in
/// one that is on, and a provider that is live.
pub(crate) fn gate_methods(state: &SharedState) -> SignInMethods {
    let built_in = |id: &str, kind: &'static str| GateMethod {
        id: id.to_string(),
        kind,
        label: None,
        icon: None,
        image: None,
        brand: None,
    };
    let methods = sign_in_config(state)
        .methods
        .iter()
        .filter_map(|method| match method {
            Method::Password(on) => on.enabled.then(|| built_in(PASSWORD_ID, "password")),
            Method::Passkey(on) => on.enabled.then(|| built_in(PASSKEY_ID, "passkey")),
            Method::Oidc(provider) => provider.is_live().then(|| GateMethod {
                id: provider.id.clone(),
                kind: "oidc",
                label: Some(provider.label.clone()),
                icon: Some(provider.icon.clone()),
                image: method_image(provider),
                brand: method_brand(provider),
            }),
        })
        .collect();
    SignInMethods { methods }
}

pub(crate) fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// The address scheme the native apps register, which a flow begun in one
/// comes back on.
pub(crate) const APP_RETURN: &str = "kroma://sso";

/// `origin` when a flow may begin and end there: a bare http(s) origin, and
/// one of the operator's own when they named any (the rule passkeys follow).
pub(crate) fn accepted_origin(state: &SharedState, origin: &str) -> Option<String> {
    let origin = origin.trim().trim_end_matches('/');
    let bare = origin.split_once("://").is_some_and(|(_, rest)| !rest.contains('/'));
    if !bare || web_target(origin).is_none() {
        return None;
    }
    let allowed = crate::api::passkeys::allowed_origins(state);
    (allowed.is_empty() || allowed.iter().any(|o| o == origin)).then(|| origin.to_string())
}

/// The origin a browser is calling from, when [`accepted_origin`] takes it.
pub(crate) fn request_origin(state: &SharedState, headers: &HeaderMap) -> Option<String> {
    let origin = headers.get(axum::http::header::ORIGIN)?.to_str().ok()?;
    accepted_origin(state, origin)
}

/// The providers the operator pointed at `issuer`, which is all an identity
/// stores of where it came from.
pub(crate) fn providers_at<'a>(
    config: &'a SignIn,
    issuer: &'a str,
) -> impl Iterator<Item = &'a Provider> {
    config
        .providers()
        .filter(move |p| same_issuer(&p.issuer, issuer))
}

/// The name a provider goes by where an issuer is all that was stored.
pub(crate) fn provider_name(config: &SignIn, issuer: &str) -> String {
    providers_at(config, issuer)
        .next()
        .map(|p| p.label.clone())
        .filter(|label| !label.is_empty())
        .or_else(|| web_target(issuer).map(|target| target.host))
        .unwrap_or_else(|| issuer.to_string())
}
