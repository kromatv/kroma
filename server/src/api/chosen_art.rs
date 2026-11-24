//! `/api/art/{kind}/{id}`: the poster, the backdrop and the logo an admin chose
//! for a film (`item`) or a show (`show`), behind `library.manage`. A change
//! reaches clients through the `ItemUpdated` / `ShowUpdated` event.
//!
//! - `GET /api/art/{kind}/{id}` → `{ poster, backdrop, logo }`, the URL of each
//!   picture an admin chose, or null.
//! - `POST /api/art/{kind}/{id}/{role}` (raw `image/*` body, `role` is `poster`,
//!   `backdrop` or `logo`) → `{ url }`, where the title's picture is served now.
//! - `DELETE /api/art/{kind}/{id}/{role}` → 204, and the title shows the
//!   picture beside its files again, or its fetched one.

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;

use crate::api::error::lerr;
use crate::api::managed_title::{not_found, Managed};
use crate::api::util::{blocking, query};
use crate::db;
use crate::db::art_beside::{BACKDROP, LOGO, POSTER};
use crate::db::art_chosen::Slot;
use crate::i18n;
use crate::model::User;
use crate::services::art_chosen::{self, Choice};
use crate::state::SharedState;

const MAX_PICTURE_BYTES: usize = 32 * 1024 * 1024;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/art/{kind}/{id}", get(chosen)).route(
        "/art/{kind}/{id}/{role}",
        post(choose)
            .delete(reset)
            .layer(DefaultBodyLimit::max(MAX_PICTURE_BYTES)),
    )
}

struct Target {
    kind: &'static str,
    id: String,
    role: &'static str,
}

impl Target {
    fn slot(&self) -> Slot<'_> {
        Slot {
            kind: self.kind,
            id: &self.id,
            role: self.role,
        }
    }
}

async fn chosen(
    State(state): State<SharedState>,
    Managed { kind, id, .. }: Managed,
) -> Result<Response, Response> {
    let urls = query(&state.db, move |pool| {
        db::art_chosen::chosen(&pool, kind, &id)
    })
    .await?;
    let chosen = json!({ "poster": urls.poster, "backdrop": urls.backdrop, "logo": urls.logo });
    Ok(Json(chosen).into_response())
}

struct Asked {
    user: User,
    target: Target,
}

impl FromRequestParts<SharedState> for Asked {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &SharedState) -> Result<Self, Response> {
        let Managed {
            user,
            kind,
            id,
            path,
        } = Managed::from_request_parts(parts, state).await?;
        let role = [POSTER, BACKDROP, LOGO]
            .into_iter()
            .find(|role| path.get("role").is_some_and(|asked| asked == role));
        let Some(role) = role else {
            return Err(not_found(&user));
        };
        Ok(Self {
            user,
            target: Target { kind, id, role },
        })
    }
}

async fn choose(
    State(state): State<SharedState>,
    Asked { user, target }: Asked,
    body: Bytes,
) -> Result<Response, Response> {
    let locale = i18n::user_locale(&user);
    if body.is_empty() {
        return Err(lerr(locale, StatusCode::BAD_REQUEST, "error.emptyBody"));
    }
    let choice = blocking(move || art_chosen::choose(&state, target.slot(), &body)).await?;
    match choice {
        Choice::Shown(url) => Ok(Json(json!({ "url": url })).into_response()),
        Choice::Unreadable => Err(lerr(
            locale,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "error.imageUnreadable",
        )),
        Choice::NoSuchTitle => Err(not_found(&user)),
    }
}

async fn reset(
    State(state): State<SharedState>,
    Asked { user, target }: Asked,
) -> Result<Response, Response> {
    if blocking(move || art_chosen::reset(&state, target.slot())).await? {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Err(not_found(&user))
    }
}
