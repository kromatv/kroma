//! Enforces per-user library visibility (ACCT-20, ACCT-21) on the catalogue
//! handlers: a title in a library the caller was not granted is absent from
//! every listing and unreachable by its id.

use std::collections::HashSet;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;

use crate::api::error::json_error;
use crate::api::util::query;
use crate::db;
use crate::model::{LibraryScope, MediaItem, Section, SectionItem, Show, User};
use crate::state::SharedState;

/// A title the caller may not see answers exactly as one that was never
/// scanned: a `404` distinguishable from "forbidden" would itself confirm the
/// title exists.
pub fn out_of_scope() -> Response {
    json_error(StatusCode::NOT_FOUND, "item not found")
}

/// Refuse unless `item_id` is in a library `user` was granted. An unknown id
/// refuses too, so probing cannot tell the two apart.
pub async fn gate_item(state: &SharedState, user: &User, item_id: &str) -> Result<(), Response> {
    if user.sees_every_library() {
        return Ok(());
    }
    let id = item_id.to_string();
    let library = query(&state.db, move |pool| db::item_library(&pool, &id)).await?;
    match library {
        Some(library) if user.sees_library(&library) => Ok(()),
        _ => Err(out_of_scope()),
    }
}

/// Refuse unless the caller may see what `subject_id` saves to "Ma liste" or
/// marks watched: an item or a show in a granted library, or `tmdb:<id>`, a
/// title not in the library yet, which no grant covers and none hides.
pub async fn gate_saved(
    state: &SharedState,
    user: &User,
    subject_id: &str,
) -> Result<(), Response> {
    if user.sees_every_library() || is_tmdb_title(subject_id) {
        return Ok(());
    }
    let id = subject_id.to_string();
    let library = query(&state.db, move |pool| db::subject_library(&pool, &id)).await?;
    match library {
        Some(library) if user.sees_library(&library) => Ok(()),
        _ => Err(out_of_scope()),
    }
}

/// Which of the saved `subject_ids` the caller may see, under the rule of
/// [`gate_saved`].
pub async fn visible_saved_ids(
    state: &SharedState,
    user: &User,
    subject_ids: Vec<String>,
) -> Result<HashSet<String>, Response> {
    if user.sees_every_library() {
        return Ok(subject_ids.into_iter().collect());
    }
    let (tmdb, local): (Vec<String>, Vec<String>) =
        subject_ids.into_iter().partition(|id| is_tmdb_title(id));
    let mut visible: HashSet<String> = tmdb.into_iter().collect();
    if local.is_empty() {
        return Ok(visible);
    }
    let libraries = query(&state.db, move |pool| db::subject_libraries(&pool, &local)).await?;
    visible.extend(
        libraries
            .into_iter()
            .filter(|(_, library)| user.sees_library(library))
            .map(|(id, _)| id),
    );
    Ok(visible)
}

fn is_tmdb_title(subject_id: &str) -> bool {
    subject_id
        .strip_prefix("tmdb:")
        .is_some_and(|n| n.bytes().all(|b| b.is_ascii_digit()) && n.parse::<u64>().is_ok())
}

pub async fn gate_show(state: &SharedState, user: &User, show_id: &str) -> Result<(), Response> {
    if user.sees_every_library() {
        return Ok(());
    }
    let id = show_id.to_string();
    let library = query(&state.db, move |pool| db::show_library(&pool, &id)).await?;
    match library {
        Some(library) if user.sees_library(&library) => Ok(()),
        _ => Err(out_of_scope()),
    }
}

/// The item behind `item_id` when the caller may see it. `None` both for an
/// unknown id and for one outside an identified caller's grant; an anonymous
/// caller is outside this requirement's reach (see the byte routes in
/// [`crate::api::stream`]).
pub async fn item_in_scope(
    state: &SharedState,
    caller: Option<&User>,
    item_id: String,
) -> Option<MediaItem> {
    let item = query(&state.db, move |pool| db::get_item(&pool, &item_id))
        .await
        .ok()
        .flatten()?;
    match caller {
        Some(user) if !user.sees_library(&item.library) => None,
        _ => Some(item),
    }
}

pub fn keep_items(user: &User, items: &mut Vec<MediaItem>) {
    if user.sees_every_library() {
        return;
    }
    items.retain(|item| user.sees_library(&item.library));
}

pub fn keep_shows(user: &User, shows: &mut Vec<Show>) {
    if user.sees_every_library() {
        return;
    }
    shows.retain(|show| user.sees_library(&show.library));
}

/// Drop hidden entries from every home rail, then drop the rails left empty: a
/// titled row with nothing in it announces what was removed. A caller held to
/// no grant gets the shared rails back without a copy.
pub fn keep_sections(user: &User, sections: Arc<Vec<Section>>) -> Arc<Vec<Section>> {
    if user.sees_every_library() || user.libraries == LibraryScope::All {
        return sections;
    }
    let mut kept = Vec::clone(&sections);
    for section in kept.iter_mut() {
        section
            .items
            .retain(|entry| user.sees_library(library_of(entry)));
    }
    kept.retain(|section| !section.items.is_empty());
    Arc::new(kept)
}

pub fn keep_section_item(user: &User, entry: Option<SectionItem>) -> Option<SectionItem> {
    entry.filter(|entry| user.sees_library(library_of(entry)))
}

/// Which of `item_ids` the caller may see. An unrestricted caller gets every id
/// back, so the answer is safe to use as the only filter.
pub async fn visible_item_ids(
    state: &SharedState,
    user: &User,
    item_ids: Vec<String>,
) -> Result<HashSet<String>, Response> {
    if user.sees_every_library() {
        return Ok(item_ids.into_iter().collect());
    }
    if item_ids.is_empty() {
        return Ok(HashSet::new());
    }
    let libraries = query(&state.db, move |pool| db::item_libraries(&pool, &item_ids)).await?;
    Ok(libraries
        .into_iter()
        .filter(|(_, library)| user.sees_library(library))
        .map(|(id, _)| id)
        .collect())
}

fn library_of(entry: &SectionItem) -> &str {
    match entry {
        SectionItem::Movie { item } => &item.library,
        SectionItem::Show { show } => &show.library,
    }
}

#[cfg(test)]
mod tests;
