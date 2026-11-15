use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use super::{accepted_origin, now, request_origin, sign_in_config, CALLBACK_PATH};
use crate::api::dto::FlowStarted;
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{blocking, client_ip};
use crate::i18n::{self, ReqLocale};
use crate::services::sso::flows::{Intent, NewFlow, ReturnTo, FLOW_TTL_SECS};
use crate::services::sso::identify::authorize_url;
use crate::state::SharedState;

/// What a client says about itself when it starts a flow. A browser says
/// nothing: its `Origin` header is where the flow begins and ends. A native
/// app has no origin, so it names the server address it is talking to and
/// asks to be sent back on its own scheme.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowClient {
    #[serde(default)]
    pub return_to: Option<String>,
    #[serde(default)]
    pub origin: Option<String>,
}

impl FlowClient {
    fn return_to(&self) -> ReturnTo {
        match self.return_to.as_deref() {
            Some("app") => ReturnTo::App,
            _ => ReturnTo::Web,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct StartBody {
    pub provider: String,
    #[serde(default)]
    pub invite: Option<String>,
    #[serde(flatten)]
    pub client: FlowClient,
}

/// `POST /api/auth/sso/start` `{ provider, invite?, returnTo?, origin? }` →
/// `{ flowId, secret, authorizeUrl, expiresInSec }`. Public: this is how a
/// sign-in begins.
pub async fn start(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<StartBody>,
) -> Response {
    let invite = body.invite.filter(|token| !token.trim().is_empty());
    let intent = Intent::SignIn { invite };
    begin(&state, loc, &headers, &addr, &body.provider, intent, &body.client).await
}

#[derive(Debug, Deserialize)]
pub struct LinkBody {
    pub provider: String,
    #[serde(flatten)]
    pub client: FlowClient,
}

/// `POST /api/auth/me/identities` (Bearer) `{ provider }` → a flow that ends
/// with the identity on the caller's account.
pub async fn link(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBody>,
) -> Response {
    let intent = Intent::Link { user_id: user.id };
    begin(&state, loc, &headers, &addr, &body.provider, intent, &body.client).await
}

/// Opens a flow for `intent` at `provider_id`. A test may run against a
/// provider that is not live yet, and reads it afresh; anything else needs a
/// live one.
pub(crate) async fn begin(
    state: &SharedState,
    loc: &str,
    headers: &HeaderMap,
    addr: &SocketAddr,
    provider_id: &str,
    intent: Intent,
    client: &FlowClient,
) -> Response {
    let origin = request_origin(state, headers).or_else(|| {
        client
            .origin
            .as_deref()
            .and_then(|named| accepted_origin(state, named))
    });
    let Some(origin) = origin else {
        return lerr(loc, StatusCode::BAD_REQUEST, "sso.originInvalid");
    };
    let testing = matches!(intent, Intent::Test { .. });
    let provider = sign_in_config(state)
        .provider(provider_id)
        .filter(|p| if testing { p.is_configured() } else { p.is_live() })
        .cloned();
    let Some(provider) = provider else {
        return lerr(loc, StatusCode::NOT_FOUND, "sso.providerUnknown");
    };

    let (reader, issuer) = (state.clone(), provider.issuer.clone());
    let read = blocking(move || {
        let directory = &reader.sso.directory;
        Ok(if testing {
            directory.read(&issuer, now())
        } else {
            directory.lookup(&issuer, now())
        })
    })
    .await;
    let metadata = match read {
        Ok(Ok((metadata, _))) => metadata,
        Ok(Err(e)) => {
            tracing::warn!(provider = %provider.id, error = ?e, "sign-in provider unreadable");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "error": i18n::t(loc, "sso.providerUnreachable", &[]),
                    "code": "sso.providerUnreachable",
                    "reason": e.code(),
                })),
            )
                .into_response();
        }
        Err(resp) => return resp,
    };

    let redirect_uri = format!("{origin}{CALLBACK_PATH}");
    let address = client_ip(headers, addr, &state.config.trusted_proxies);
    let started = state.sso.flows.start(
        NewFlow {
            provider_id: provider.id.clone(),
            fingerprint: provider.fingerprint(),
            intent,
            origin,
            return_to: client.return_to(),
            redirect_uri: redirect_uri.clone(),
        },
        &address,
        now(),
    );
    let Some(started) = started else {
        return lerr(loc, StatusCode::TOO_MANY_REQUESTS, "sso.tooManyFlows");
    };
    Json(FlowStarted {
        authorize_url: authorize_url(&metadata, &provider, &started, &redirect_uri),
        flow_id: started.id,
        secret: started.secret,
        expires_in_sec: FLOW_TTL_SECS,
    })
    .into_response()
}
