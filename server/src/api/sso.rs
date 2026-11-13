//! Signing in through an OpenID Connect provider. A client starts a flow and
//! keeps its secret, the person goes to the provider and comes back through
//! [`callback`], and the client collects with the secret and the code the
//! browser carried home. Neither half redeems anything without the other.

use axum::http::HeaderMap;
use axum::routing::{delete, get, post};
use axum::Router;
use kroma_http::address::web_target;

use crate::services::settings::{self, SignIn};
use crate::state::SharedState;

mod begin;
mod callback;
mod finish;
mod identities;

pub(crate) use begin::begin;
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
}

pub(crate) fn sign_in_config(state: &SharedState) -> SignIn {
    settings::sign_in(&state.settings, state.config.sign_in_provider.as_ref())
}

pub(crate) fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// The origin a browser is calling from, when a flow may begin and end there:
/// a bare http(s) origin, and one of the operator's own when they named any
/// (the rule passkeys follow).
pub(crate) fn request_origin(state: &SharedState, headers: &HeaderMap) -> Option<String> {
    let origin = headers
        .get(axum::http::header::ORIGIN)?
        .to_str()
        .ok()?
        .trim()
        .trim_end_matches('/');
    let bare = origin.split_once("://").is_some_and(|(_, rest)| !rest.contains('/'));
    if !bare || web_target(origin).is_none() {
        return None;
    }
    let allowed = crate::api::passkeys::allowed_origins(state);
    (allowed.is_empty() || allowed.iter().any(|o| o == origin)).then(|| origin.to_string())
}

/// The name a provider goes by where an issuer is all that was stored.
pub(crate) fn provider_name(config: &SignIn, issuer: &str) -> String {
    let same = |typed: &str| typed.trim().trim_end_matches('/') == issuer.trim_end_matches('/');
    config
        .providers
        .iter()
        .find(|p| same(&p.issuer))
        .map(|p| p.label.clone())
        .filter(|label| !label.is_empty())
        .or_else(|| web_target(issuer).map(|target| target.host))
        .unwrap_or_else(|| issuer.to_string())
}
