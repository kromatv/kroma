//! The caller of a receiver route: a signed-in account allowed to cast, and
//! the receiver id the path names, already known to be well formed.

use axum::extract::{FromRequestParts, Path};
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};

use super::bad_id;
use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::model::{Permission, User};
use crate::services::cast::valid_receiver_id;
use crate::state::SharedState;

pub(super) struct ReceiverCall {
    pub user: User,
    pub id: String,
}

impl FromRequestParts<SharedState> for ReceiverCall {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        require(&user, Permission::Playback)?;
        let Path(id) = Path::<String>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        if !valid_receiver_id(&id) {
            return Err(bad_id(&user));
        }
        Ok(Self { user, id })
    }
}
