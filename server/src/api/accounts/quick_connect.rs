//! Quick Connect: a device shows a short code, an account approves it, and the
//! device collects the session on its next poll.

use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{drop_orphans, SecretQuery};
use crate::i18n::ReqLocale;
use crate::services::pairing::Orphaned;
use crate::state::SharedState;

use super::mint_device_tokens;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickInitiateBody {
    pub prev_secret: Option<String>,
}

/// `POST /api/auth/quickconnect/initiate` → `{ code, secret, expiresInSec,
/// authorizeUrl? }`. The device shows `code` and polls with `secret`; rotating an
/// expiring code sends the old secret as `prevSecret` so the server drops it.
pub async fn quick_initiate(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    body: Option<Json<QuickInitiateBody>>,
) -> Response {
    // Drop the rotated-away code so it stops being approvable, along with any
    // tokens it accrued in the gap (approved but never polled for).
    if let Some(Json(QuickInitiateBody {
        prev_secret: Some(secret),
    })) = body
    {
        drop_orphans(&state, state.quickconnect.revoke(&secret)).await;
    }
    let initiated = state.quickconnect.initiate();
    drop_orphans(&state, state.quickconnect.take_orphans()).await;
    let Some(init) = initiated else {
        return lerr(loc, StatusCode::TOO_MANY_REQUESTS, "connect.tooManyPending");
    };
    let web_base = state.config.web_url.clone().or_else(|| {
        let url = crate::services::settings::public_url(&state.settings);
        (!url.is_empty()).then_some(url)
    });
    let authorize_url = web_base.map(|w| format!("{w}/connect?code={}", init.code));
    Json(crate::api::dto::QuickConnectInit {
        code: init.code,
        secret: init.secret,
        expires_in_sec: init.expires_in,
        authorize_url,
    })
    .into_response()
}

#[derive(Debug, Deserialize)]
pub struct QuickAuthorizeBody {
    pub code: String,
}

/// `POST /api/auth/quickconnect/authorize` (Bearer) `{ code }` → 204. Approves a
/// device's code, minting the session it collects on its next poll.
pub async fn quick_authorize(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Json(body): Json<QuickAuthorizeBody>,
) -> Response {
    let code = body.code.trim().to_string();

    // PIN-verified: the approver is already signed in and vouches for the device.
    // That device isn't the caller, so its UA is unknown here (NULL) until use.
    let (token, access) = match mint_device_tokens(&state, &user.id, None).await {
        Ok(pair) => pair,
        Err(resp) => return resp,
    };

    let approved = state
        .quickconnect
        .authorize(&code, user, token.clone(), access.clone());
    drop_orphans(&state, state.quickconnect.take_orphans()).await;
    if approved {
        StatusCode::NO_CONTENT.into_response()
    } else {
        // Unknown/expired code → don't leave the just-created tokens dangling.
        drop_orphans(
            &state,
            Some(Orphaned {
                token,
                access_token: access,
            }),
        )
        .await;
        lerr(loc, StatusCode::NOT_FOUND, "connect.invalidCode")
    }
}

/// `GET /api/auth/quickconnect/poll` → `{ status }` where status is `pending` |
/// `authorized` (then `{ token, user }`) | `expired`.
///
/// The secret is read from `X-Kroma-Pairing-Secret` when present, and from
/// `?secret=` otherwise. A URL is written down everywhere a request goes past
/// (the tracing span records the uri, and every reverse proxy logs it), which
/// is not where a credential redeeming a 90-day token belongs. The query is
/// still honoured because televisions already in the world send it that way.
pub async fn quick_poll(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(q): Query<SecretQuery>,
) -> Response {
    let secret = headers
        .get("x-kroma-pairing-secret")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .or(q.secret)
        .unwrap_or_default();
    let status = crate::api::dto::PairingPoll::from(state.quickconnect.poll(&secret));
    // A code that lapsed after it was approved still has rows behind it.
    drop_orphans(&state, state.quickconnect.take_orphans()).await;
    Json(status).into_response()
}
