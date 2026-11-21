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
use crate::api::util::{blocking, query};
use crate::db::{self, TitleAccess};
use crate::model::{MediaItem, RequestKind, User};
use crate::state::SharedState;

mod lists;

pub use crate::services::viewer::{ShowRatings, Viewer};
pub use lists::{keep_discovered, keep_items, keep_section_item, keep_sections, keep_shows};
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
    blocking(move || Viewer::load(&engine, user)).await
}

/// A title the caller may not see answers exactly as one that was never
/// scanned: a `404` distinguishable from "forbidden" would itself confirm the
/// title exists.
pub fn out_of_scope() -> Response {
    json_error(StatusCode::NOT_FOUND, "item not found")
}

/// What a gate is asked about.
#[derive(Debug, Clone, Copy)]
pub enum Title<'a> {
    /// A film, a video or an episode, by id.
    Item(&'a str),
    Show(&'a str),
    /// An item, else a show: what a saved title or a suggestion seed names.
    Subject(&'a str),
    /// A title by its provider id, as discovery and trailers name one.
    Tmdb(RequestKind, u64),
}

/// Refuse unless the caller may see `title`. An unknown title refuses too, so
/// probing cannot tell the two apart. Under a ceiling a title the server does
/// not hold is unrated (ACCT-111), so a provider id answers only for a held
/// title that passes; without one, no provider id is refused here.
pub async fn gate(state: &SharedState, viewer: &Viewer, title: Title<'_>) -> Result<(), Response> {
    let row = match title {
        Title::Item(id) => (Table::Items, id),
        Title::Show(id) => (Table::Shows, id),
        Title::Subject(id) => (Table::Subjects, id),
        Title::Tmdb(kind, tmdb_id) => return gate_tmdb(state, viewer, (kind, tmdb_id)).await,
    };
    if viewer.sees_everything() {
        return Ok(());
    }
    let seen = seen_among(state, viewer, (row.0, vec![row.1.to_string()])).await?;
    if seen.is_empty() {
        Err(out_of_scope())
    } else {
        Ok(())
    }
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
    match (is_tmdb_title(subject_id), viewer.is_held()) {
        (true, true) => Err(out_of_scope()),
        (true, false) => Ok(()),
        (false, _) => gate(state, viewer, Title::Subject(subject_id)).await,
    }
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
    let mut visible = seen_among(state, viewer, (Table::Subjects, local)).await?;
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
    seen_among(state, viewer, (Table::Items, item_ids)).await
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

async fn gate_tmdb(
    state: &SharedState,
    viewer: &Viewer,
    (kind, tmdb_id): (RequestKind, u64),
) -> Result<(), Response> {
    if !viewer.is_held() {
        return Ok(());
    }
    let held = query(&state.db, move |pool| {
        let matched = db::titles_by_tmdb(&*pool.get()?, kind, tmdb_id)?;
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

#[derive(Debug, Clone, Copy)]
enum Table {
    Items,
    Shows,
    Subjects,
}

impl Table {
    fn read(self, pool: &db::Pool, ids: &[String]) -> anyhow::Result<HashMap<String, TitleAccess>> {
        match self {
            Table::Items => db::items_access(pool, ids),
            Table::Shows => db::shows_access(pool, ids),
            Table::Subjects => db::subjects_access(pool, ids),
        }
    }
}

async fn seen_among(
    state: &SharedState,
    viewer: &Viewer,
    (table, ids): (Table, Vec<String>),
) -> Result<HashSet<String>, Response> {
    if viewer.sees_everything() {
        return Ok(ids.into_iter().collect());
    }
    if ids.is_empty() {
        return Ok(HashSet::new());
    }
    let found = query(&state.db, move |pool| table.read(&pool, &ids)).await?;
    Ok(viewer.seen_ids(&found))
}

#[cfg(test)]
mod tests;
