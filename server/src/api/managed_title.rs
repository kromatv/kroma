//! A film (`item`) or a show (`show`) named by a route's `{kind}/{id}`, for a
//! person who manages the library, or another kind a route accepts.

use std::collections::HashMap;

use axum::extract::{FromRequestParts, Path};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::db::metadata_core::{ITEM, SHOW};
use crate::i18n;
use crate::model::{Permission, User};
use crate::state::SharedState;

/// The title a request names, asked by someone with `library.manage`. `path`
/// holds the route's other segments.
pub(super) struct Managed {
    pub user: User,
    pub kind: &'static str,
    pub id: String,
    pub path: HashMap<String, String>,
}

/// The answer for a title, or a part of one, that is not there.
pub(super) fn not_found(user: &User) -> Response {
    lerr(
        i18n::user_locale(user),
        StatusCode::NOT_FOUND,
        "error.itemNotFound",
    )
}

impl Managed {
    /// The title a request names when its kind is one of `kinds`.
    pub(super) async fn among(
        parts: &mut Parts,
        state: &SharedState,
        kinds: &[&'static str],
    ) -> Result<Self, Response> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        require(&user, Permission::LibraryManage)?;
        let Path(mut path) = Path::<HashMap<String, String>>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        let kind = path.remove("kind").unwrap_or_default();
        let (Some(kind), Some(id)) = (
            kinds.iter().copied().find(|k| *k == kind),
            path.remove("id"),
        ) else {
            return Err(not_found(&user));
        };
        Ok(Self {
            user,
            kind,
            id,
            path,
        })
    }
}

impl FromRequestParts<SharedState> for Managed {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &SharedState) -> Result<Self, Response> {
        Self::among(parts, state, &[ITEM, SHOW]).await
    }
}
