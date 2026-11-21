//! Enforces what a session may see: a title in a library the caller was not
//! granted (ACCT-20, ACCT-34), or that the maturity ceiling its profile is held
//! to keeps from it (ACCT-109 to ACCT-113), is absent from every listing and
//! unreachable by its id. Every gate here takes a [`Viewer`], which carries
//! both rules, so a handler cannot apply one and forget the other.

use std::collections::{HashMap, HashSet};

use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::Response;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db::{self, TitleAccess};
use crate::model::{MediaItem, RequestKind, User};
use crate::state::SharedState;

mod lists;

pub use crate::services::viewer::{ShowRatings, Viewer};
pub use lists::{
    keep_discovered, keep_items, keep_rows, keep_section_item, keep_sections, keep_shows,
};
use lists::{ratings_of_shows, shows_behind};

/// The session's account with everything that keeps a title from it. Rejects
/// exactly as [`AuthUser`] does.
pub struct AuthViewer(pub Viewer);

impl FromRequestParts<SharedState> for AuthViewer {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        viewer_of(state, user).await.map(AuthViewer)
    }
}

/// `user` with the ceiling stored on its row, read on every request so a
/// changed ceiling bites on the next one (ACCT-114).
pub async fn viewer_of(state: &SharedState, user: User) -> Result<Viewer, Response> {
    let engine = state.clone();
    query(&state.db, move |pool| {
        Viewer::load(&pool, &engine.settings, &engine.config, user)
    })
    .await
}

/// A title the caller may not see answers exactly as one that was never
/// scanned: a `404` distinguishable from "forbidden" would itself confirm the
/// title exists.
pub fn out_of_scope() -> Response {
    json_error(StatusCode::NOT_FOUND, "item not found")
}

/// Refuse unless the caller may see the item behind `item_id`. An unknown id
/// refuses too, so probing cannot tell the two apart.
pub async fn gate_item(
    state: &SharedState,
    viewer: &Viewer,
    item_id: &str,
) -> Result<(), Response> {
    gate_by(state, viewer, item_id, db::items_access).await
}

pub async fn gate_show(
    state: &SharedState,
    viewer: &Viewer,
    show_id: &str,
) -> Result<(), Response> {
    gate_by(state, viewer, show_id, db::shows_access).await
}

/// Refuse unless the caller may see the item or the show `subject_id` names.
pub async fn gate_subject(
    state: &SharedState,
    viewer: &Viewer,
    subject_id: &str,
) -> Result<(), Response> {
    gate_by(state, viewer, subject_id, db::subjects_access).await
}

/// Refuse unless the caller may see what `subject_id` saves to "Ma liste" or
/// marks watched: an item or a show it may see, or `tmdb:<id>`, a title not in
/// the library yet. No grant covers one of those and none hides it, but under
/// a ceiling it counts as unrated (ACCT-111).
pub async fn gate_saved(
    state: &SharedState,
    viewer: &Viewer,
    subject_id: &str,
) -> Result<(), Response> {
    if is_tmdb_title(subject_id) {
        return if viewer.is_held() {
            Err(out_of_scope())
        } else {
            Ok(())
        };
    }
    gate_subject(state, viewer, subject_id).await
}

/// Which of the saved `subject_ids` the caller may see, under the rule of
/// [`gate_saved`].
pub async fn visible_saved_ids(
    state: &SharedState,
    viewer: &Viewer,
    subject_ids: Vec<String>,
) -> Result<HashSet<String>, Response> {
    let (tmdb, local): (Vec<String>, Vec<String>) =
        subject_ids.into_iter().partition(|id| is_tmdb_title(id));
    let mut visible = seen_among(state, viewer, local, db::subjects_access).await?;
    if !viewer.is_held() {
        visible.extend(tmdb);
    }
    Ok(visible)
}

/// Which of `item_ids` the caller may see. An unrestricted caller gets every id
/// back, so the answer is safe to use as the only filter.
pub async fn visible_item_ids(
    state: &SharedState,
    viewer: &Viewer,
    item_ids: Vec<String>,
) -> Result<HashSet<String>, Response> {
    seen_among(state, viewer, item_ids, db::items_access).await
}

/// The item behind `item_id` when the caller may see it, `None` both for an
/// unknown id and for one kept from the caller. The media byte routes hold
/// every request to this, so a changed grant or ceiling bites at once.
pub async fn item_in_scope(
    state: &SharedState,
    viewer: &Viewer,
    item_id: String,
) -> Option<MediaItem> {
    let item = query(&state.db, move |pool| db::get_item(&pool, &item_id))
        .await
        .ok()
        .flatten()?;
    let shows = ratings_of_shows(state, viewer, shows_behind([&item]))
        .await
        .ok()?;
    viewer.sees_item(&item, &shows).then_some(item)
}

/// The film and show ids the caller may see, when anything beyond its
/// libraries is kept from it: what a filter over the whole catalogue (the
/// search index) holds the caller to. `None` when the libraries say it all.
pub async fn seen_titles(
    state: &SharedState,
    viewer: &Viewer,
) -> Result<Option<HashSet<String>>, Response> {
    if !viewer.is_held() {
        return Ok(None);
    }
    let every = query(&state.db, move |pool| db::every_title_access(&pool)).await?;
    Ok(Some(viewer.seen_ids(&every)))
}

/// Refuse a title named by its provider id, as discovery and trailers name
/// one, unless the caller may see it. Under a ceiling a title the server does
/// not hold is unrated (ACCT-111), so only one held in a library the caller
/// sees, and that passes, answers. Without a ceiling no title is refused here.
pub async fn gate_tmdb(
    state: &SharedState,
    viewer: &Viewer,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<(), Response> {
    if !viewer.is_held() {
        return Ok(());
    }
    let held = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let matched = db::titles_by_tmdb(&conn, kind, tmdb_id)?;
        drop(conn);
        let ids: Vec<String> = matched.into_iter().map(|(id, _)| id).collect();
        db::subjects_access(&pool, &ids)
    })
    .await?;
    if held.values().any(|title| viewer.sees(title)) {
        Ok(())
    } else {
        Err(out_of_scope())
    }
}

fn is_tmdb_title(subject_id: &str) -> bool {
    subject_id
        .strip_prefix("tmdb:")
        .is_some_and(|n| n.bytes().all(|b| b.is_ascii_digit()) && n.parse::<u64>().is_ok())
}

type Lookup = fn(&db::Pool, &[String]) -> anyhow::Result<HashMap<String, TitleAccess>>;

async fn gate_by(
    state: &SharedState,
    viewer: &Viewer,
    id: &str,
    lookup: Lookup,
) -> Result<(), Response> {
    if viewer.sees_everything() {
        return Ok(());
    }
    let ids = vec![id.to_string()];
    let found = query(&state.db, move |pool| lookup(&pool, &ids)).await?;
    match found.values().next() {
        Some(title) if viewer.sees(title) => Ok(()),
        _ => Err(out_of_scope()),
    }
}

async fn seen_among(
    state: &SharedState,
    viewer: &Viewer,
    ids: Vec<String>,
    lookup: Lookup,
) -> Result<HashSet<String>, Response> {
    if viewer.sees_everything() {
        return Ok(ids.into_iter().collect());
    }
    if ids.is_empty() {
        return Ok(HashSet::new());
    }
    let found = query(&state.db, move |pool| lookup(&pool, &ids)).await?;
    Ok(viewer.seen_ids(&found))
}

#[cfg(test)]
mod tests;
