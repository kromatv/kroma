//! What the mail relay asks of this server: proof that the origin it is
//! registering holds the key it registers with. Public, because the relay
//! holds no credential of ours; answering reveals only a signature over the
//! relay's own nonce.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::api::error::json_error;
use crate::services::email;
use crate::state::SharedState;

const MAX_NONCE_LEN: usize = 128;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/mail/relay-challenge", get(relay_challenge))
}

#[derive(Debug, Deserialize)]
pub struct ChallengeQuery {
    #[serde(default)]
    pub nonce: String,
}

/// `GET /api/mail/relay-challenge?nonce=…` → `{ nonce, signature }`, the nonce
/// signed by this server's relay identity.
pub async fn relay_challenge(
    State(state): State<SharedState>,
    Query(q): Query<ChallengeQuery>,
) -> Response {
    let nonce = q.nonce.trim();
    if nonce.is_empty()
        || nonce.len() > MAX_NONCE_LEN
        || !nonce
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return json_error(StatusCode::BAD_REQUEST, "nonce: not one of the relay's");
    }
    match email::ensure_identity(&state.settings, &state.db) {
        Ok(identity) => {
            Json(json!({ "nonce": nonce, "signature": identity.sign(nonce) })).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}
