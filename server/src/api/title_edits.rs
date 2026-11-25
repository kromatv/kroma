//! `/api/edits/{kind}/{id}`: what a person who manages the library wrote by
//! hand about a film (`item`) or a show (`show`), behind `library.manage`
//! (LIB-83). A change reaches clients through the `ItemUpdated` /
//! `ShowUpdated` event.
//!
//! - `GET` → `{ title, originalTitle, sortTitle, tagline, overview, year,
//!   released, genres }`, each null where the title follows the provider.
//!   `released` is a day, `yyyy-mm-dd`.
//! - `PUT` with the same body → the edit as kept: trimmed, with each empty
//!   field handed back to the provider and the year taken from `released`.
//!   400 when a field is longer than a title holds, the year is out of range
//!   or `released` is no day.

use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};

use crate::api::error::lerr;
use crate::api::managed_title::{not_found, Managed};
use crate::api::util::{blocking, query};
use crate::db;
use crate::db::title_edits::Title;
use crate::i18n;
use crate::model::title_edit::TitleEdit;
use crate::services::title_edits::{self, Edit};
use crate::state::SharedState;

const MAX_EDIT_BYTES: usize = 64 * 1024;

pub fn routes() -> Router<SharedState> {
    Router::new().route(
        "/edits/{kind}/{id}",
        get(written)
            .put(write)
            .layer(DefaultBodyLimit::max(MAX_EDIT_BYTES)),
    )
}

async fn written(
    State(state): State<SharedState>,
    title: Managed,
) -> Result<Json<TitleEdit>, Response> {
    query(&state.db, move |pool| {
        let title = Title {
            kind: title.kind,
            id: &title.id,
        };
        db::title_edits::written(&pool, title)
    })
    .await
    .map(Json)
}

async fn write(
    State(state): State<SharedState>,
    Managed { user, kind, id, .. }: Managed,
    Json(edit): Json<TitleEdit>,
) -> Result<Json<TitleEdit>, Response> {
    let title = move || title_edits::write(&state, Title { kind, id: &id }, edit);
    match blocking(title).await? {
        Edit::Kept(edit) => Ok(Json(edit)),
        Edit::DoesNotFit => Err(lerr(
            i18n::user_locale(&user),
            StatusCode::BAD_REQUEST,
            "error.titleEditTooLong",
        )),
        Edit::NoSuchTitle => Err(not_found(&user)),
    }
}
