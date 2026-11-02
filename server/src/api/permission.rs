use axum::http::StatusCode;
use axum::response::Response;

use crate::api::error::lerr;
use crate::i18n;
use crate::model::{Permission, User};

pub(crate) fn require(user: &User, perm: Permission) -> Result<(), Response> {
    if user.can(perm) {
        Ok(())
    } else {
        Err(lerr(
            i18n::user_locale(user),
            StatusCode::FORBIDDEN,
            "error.permissionDenied",
        ))
    }
}
