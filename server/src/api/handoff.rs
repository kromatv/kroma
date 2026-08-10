//! `/api/handoff`: signing a TV in by pointing at it.
//!
//! A TV with no account announces itself; a phone already signed in lists the
//! TVs waiting on its own network and grants one its account. No code crosses
//! the room, so nothing has to be read off a screen or typed on a remote.
//!
//! What places the two devices beside each other is the pair of addresses they
//! arrive from. The server does not have to be on their network: it is a
//! rendezvous, so a TV and a phone in one room pair through a server anywhere in
//! the world. The service compares only their two addresses, which is why a TV
//! somewhere else never appears in a stranger's list and a handle learned some
//! other way cannot be granted from off-network.
//!
//! An address places a device, and that is all it does: a page open in a browser
//! on that network arrives from it too. Raising a beacon therefore also asks the
//! caller for an origin this install can place
//! (`crate::api::origin::require_beacon_origin`). An origin that names nobody
//! still announces, and the grant against it asks for the check string off the
//! television's own screen, which is what a page wearing that origin has nowhere
//! to print.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::accounts::mint_device_tokens;
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::origin::{require_beacon_origin, ConfirmRequired};
use crate::api::util::{client_ip, drop_orphans};
use crate::i18n::ReqLocale;
use crate::services::pairing::handoff::{
    valid_device_id, Announce, Announcement, Claim, Nearby, Refusal,
};
use crate::services::pairing::Orphaned;
use crate::state::SharedState;

/// Reachable before a session exists: this is how a TV with no account at all
/// gets one. Open to a device, closed to a page nobody can be held to.
pub fn public_routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/handoff/announce", post(announce))
        .route("/handoff/leave", post(leave))
        .route("/handoff/poll", post(poll))
        .route_layer(from_fn_with_state(state, require_beacon_origin))
}

/// The granting half: only a signed-in account can hand itself to a TV.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/handoff/devices", get(devices))
        .route("/handoff/grant", post(grant))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnounceBody {
    pub device_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub platform: String,
    /// The secret of the beacon this one replaces, so a TV re-announcing after a
    /// settings change does not leave its old row on anyone's phone.
    #[serde(default)]
    pub prev_secret: Option<String>,
}

/// `POST /api/handoff/announce` → what the TV needs to stay listed and to
/// collect the account it is granted. `confirmRequired` says the origin this
/// beacon was raised from named nobody, so the check string has to be readable
/// on the TV's screen: the phone will ask for it before granting.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnounceReply {
    pub handle: String,
    pub secret: String,
    /// A few characters the TV prints on its own screen so a person can tell two
    /// TVs apart in the phone's list, and type back when `confirmRequired`.
    pub check: String,
    /// This install's opaque id, the same one `/health` reports. It goes in the
    /// TV's record so a phone can tell whether the handle is one ITS server
    /// would recognise: a handle is minted by one server and means nothing to
    /// another, and a household can easily have two.
    pub instance_id: String,
    /// Goes in the TV's DNS-SD record and nowhere else. A phone that can quote
    /// it heard this TV on the link, which is why the grant will take it in
    /// place of the address check.
    pub proof: String,
    pub ttl_secs: i64,
    /// How often to poll. Polling is what keeps the beacon listed, so a TV that
    /// stops polling leaves the list on its own.
    pub poll_secs: i64,
    pub confirm_required: bool,
}

/// One waiting TV in `GET /api/handoff/devices`. `confirmRequired` is the
/// phone's cue to ask for `check` rather than only show it: granting this row
/// without it is refused.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NearbyDevice {
    pub handle: String,
    pub name: String,
    pub platform: String,
    pub check: String,
    pub confirm_required: bool,
}

impl From<Nearby> for NearbyDevice {
    fn from(row: Nearby) -> Self {
        Self {
            handle: row.handle,
            name: row.name,
            platform: row.platform,
            check: row.check,
            confirm_required: row.confirm_required,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SecretBody {
    pub secret: String,
}

#[derive(Debug, Deserialize)]
pub struct GrantBody {
    pub handle: String,
    /// The beacon's `proof`, when the caller heard this TV on the link rather
    /// than being told about it by this server.
    #[serde(default)]
    pub proof: Option<String>,
    /// The check string as a person read it off the television, required by a
    /// beacon whose origin named nobody and ignored by every other.
    #[serde(default)]
    pub check: Option<String>,
}

// Delete `surrendered`, then whatever the store swept while this request was
// being served. Every handler here ends this way, because every one of them
// touches the store and the store sweeps on every touch: a beacon that was
// granted and then never polled for leaves a session and a 90-day access token
// behind, and nothing else in the server would ever delete them.
async fn sweep(state: &SharedState, surrendered: impl IntoIterator<Item = Orphaned>) {
    drop_orphans(state, surrendered).await;
    drop_orphans(state, state.handoff.take_orphans()).await;
}

/// `POST /api/handoff/announce` → [`AnnounceReply`]. Unauthenticated by design:
/// the device announcing has no account yet. Capped per address and per network,
/// closed to an origin this install refuses, and the reply's `handle` is
/// unguessable, so announcing reveals nothing to anyone who cannot already list
/// the subnet.
pub async fn announce(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Extension(ConfirmRequired(confirm_required)): Extension<ConfirmRequired>,
    headers: HeaderMap,
    Json(body): Json<AnnounceBody>,
) -> Response {
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    if state.handoff.announcing_too_often(&ip) {
        return lerr(loc, StatusCode::TOO_MANY_REQUESTS, "handoff.tooOften");
    }
    if !valid_device_id(&body.device_id) {
        return lerr(loc, StatusCode::BAD_REQUEST, "error.castBadReceiver");
    }

    if let Some(prev) = body.prev_secret.as_deref() {
        drop_orphans(&state, state.handoff.forget(prev)).await;
    }

    let (announcement, orphans) = state.handoff.announce(Announce {
        device_id: body.device_id,
        name: body.name,
        platform: body.platform,
        ip,
        confirm_required,
    });
    sweep(&state, orphans).await;

    match announcement {
        Announcement::Ok(announced) => Json(AnnounceReply {
            handle: announced.handle,
            secret: announced.secret,
            check: announced.check,
            instance_id: state.instance_id.clone(),
            proof: announced.proof,
            ttl_secs: announced.ttl_secs,
            poll_secs: announced.poll_secs,
            confirm_required: announced.confirm_required,
        })
        .into_response(),
        // This network is already holding as many waiting televisions as it may.
        // Refusing is the point: the slots belong to the devices that took them.
        Announcement::NetworkFull => {
            lerr(loc, StatusCode::TOO_MANY_REQUESTS, "handoff.tooManyHere")
        }
    }
}

/// `POST /api/handoff/leave` `{ secret }` → 204. Take the beacon down early
/// (the TV signed in another way, or is quitting) instead of waiting out its TTL.
pub async fn leave(State(state): State<SharedState>, Json(body): Json<SecretBody>) -> Response {
    sweep(&state, state.handoff.forget(&body.secret)).await;
    StatusCode::NO_CONTENT.into_response()
}

/// `POST /api/handoff/poll` `{ secret }` → `pending` | `authorized` (then the
/// session) | `expired`. Doubles as the beacon's heartbeat: a TV that stops
/// polling leaves the list.
///
/// POST, and the secret in the body rather than the query, for two reasons that
/// point the same way. It is not a read: it refreshes the beacon and consumes
/// the grant exactly once. And a URL is written down everywhere a request goes
/// past (`TraceLayer`'s span records the uri, and every reverse proxy logs it by
/// default), which is not where a credential redeeming a 90-day token belongs.
pub async fn poll(State(state): State<SharedState>, Json(body): Json<SecretBody>) -> Response {
    let status = super::dto::PairingPoll::from(state.handoff.poll(&body.secret));
    sweep(&state, []).await;
    Json(status).into_response()
}

/// `GET /api/handoff/devices` (Bearer) → the TVs waiting on the caller's own
/// network. Empty when none are, which is also the answer a caller sitting
/// somewhere else gets: being off-network is not worth a distinct error a
/// scanner could read.
pub async fn devices(
    State(state): State<SharedState>,
    AuthUser(_user): AuthUser,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    let rows: Vec<NearbyDevice> =
        state.handoff.nearby(&ip).into_iter().map(NearbyDevice::from).collect();
    sweep(&state, []).await;
    Json(rows).into_response()
}

/// `POST /api/handoff/grant` (Bearer) `{ handle }` → 204. Mints this account a
/// fresh device session and leaves it for the TV to collect on its next poll.
/// A beacon whose origin named nobody also wants `check`, read off that TV's
/// own screen; three wrong answers take the beacon down for good.
pub async fn grant(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<GrantBody>,
) -> Response {
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);

    // The granting device is signed in and vouches for the TV, exactly as a
    // Quick Connect approval does. The TV is not the caller, so its user agent
    // is unknown here (NULL) until it first uses the token.
    let (token, access) = match mint_device_tokens(&state, &user.id, None).await {
        Ok(pair) => pair,
        Err(resp) => return resp,
    };

    let claim =
        Claim { viewer_ip: &ip, proof: body.proof.as_deref(), check: body.check.as_deref() };
    match state.handoff.grant(&body.handle, claim, user, token.clone(), access.clone()) {
        Ok(()) => {
            sweep(&state, []).await;
            StatusCode::NO_CONTENT.into_response()
        }
        // Don't leave the just-minted tokens dangling.
        Err(refusal) => {
            sweep(&state, [Orphaned { token, access_token: access }]).await;
            refused(loc, refusal)
        }
    }
}

fn refused(loc: &str, refusal: Refusal) -> Response {
    match refusal {
        Refusal::CheckRequired => lerr(loc, StatusCode::BAD_REQUEST, "handoff.checkRequired"),
        Refusal::CheckWrong => lerr(loc, StatusCode::FORBIDDEN, "handoff.checkWrong"),
        Refusal::CheckTooMany => lerr(loc, StatusCode::TOO_MANY_REQUESTS, "handoff.checkTooMany"),
        Refusal::Gone => lerr(loc, StatusCode::NOT_FOUND, "handoff.gone"),
    }
}
