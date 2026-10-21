//! WebAuthn passkeys: register credentials (authenticated) and sign in with them
//! (public, passwordless). The relying party is derived per-request from the
//! `Origin` header: each passkey is bound to the origin it was created on.

mod authenticate;
mod ceremony;
mod manage;
mod register;

pub use authenticate::{authenticate_finish, authenticate_start};
pub use manage::{list, remove};
pub use register::{register_finish, register_start};

use axum::routing::{get, post};
use axum::Router;

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
