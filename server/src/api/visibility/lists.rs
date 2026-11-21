//! The listing half of [`super`]: what of a list of titles the caller may see,
//! with the badges of what is left pointed at its ratings country.

use std::collections::HashSet;
use std::sync::Arc;

use axum::response::Response;

use super::{ShowRatings, Table, Viewer, seen_among};
use crate::api::util::query;
use crate::db;
use crate::model::{ContinueItem, DiscoverEntry, Kind, MediaItem, Section, SectionItem, Show};
use crate::state::SharedState;

/// A row of a listing that carries one catalogue item: the item itself, or a
/// resume row around it.
pub trait CarriesItem {
    fn item_mut(&mut self) -> &mut MediaItem;
}

impl CarriesItem for MediaItem {
    fn item_mut(&mut self) -> &mut MediaItem {
        self
    }
}

impl CarriesItem for ContinueItem {
    fn item_mut(&mut self) -> &mut MediaItem {
        &mut self.item
    }
}

/// Drop the rows whose item the caller may not see, and point the badges of
/// the rest at its ratings country.
pub async fn keep_items<T: CarriesItem>(
    state: &SharedState,
    viewer: &Viewer,
    rows: &mut Vec<T>,
) -> Result<(), Response> {
    let behind = shows_behind(rows.iter_mut().map(|row| &*row.item_mut()));
    let shows = ratings_of_shows(state, viewer, behind).await?;
    rows.retain_mut(|row| viewer.sees_item(row.item_mut(), &shows));
    for row in rows.iter_mut() {
        viewer.relabel(row.item_mut().metadata.as_mut());
    }
    Ok(())
}

pub fn keep_shows(viewer: &Viewer, shows: &mut Vec<Show>) {
    shows.retain(|show| viewer.sees_show(show));
    for show in shows.iter_mut() {
        viewer.relabel(show.metadata.as_mut());
    }
}

/// Drop hidden entries from every home rail, then drop the rails left empty: a
/// titled row with nothing in it announces what was removed. A caller held to
/// nothing, who reads the household's labels, gets the shared rails back
/// without a copy.
pub fn keep_sections(viewer: &Viewer, sections: Arc<Vec<Section>>) -> Arc<Vec<Section>> {
    if viewer.keeps_nothing() && !viewer.reads_elsewhere() {
        return sections;
    }
    let mut kept = Vec::clone(&sections);
    for section in kept.iter_mut() {
        section.items.retain(|entry| viewer.sees_entry(entry));
        section
            .items
            .iter_mut()
            .for_each(|entry| viewer.relabel_entry(entry));
    }
    kept.retain(|section| !section.items.is_empty());
    Arc::new(kept)
}

pub fn keep_section_item(viewer: &Viewer, entry: Option<SectionItem>) -> Option<SectionItem> {
    let mut entry = entry.filter(|entry| viewer.sees_entry(entry))?;
    viewer.relabel_entry(&mut entry);
    Some(entry)
}

/// Drop the discovered titles the caller may not see. Under a ceiling that is
/// every title the server does not hold, and every held one that does not
/// pass; without one, nothing.
pub async fn keep_discovered(
    state: &SharedState,
    viewer: &Viewer,
    entries: &mut Vec<DiscoverEntry>,
) -> Result<(), Response> {
    if !viewer.is_held() {
        return Ok(());
    }
    let held: Vec<String> = entries.iter().filter_map(|e| e.local_id.clone()).collect();
    let seen = seen_among(state, viewer, (Table::Subjects, held)).await?;
    entries.retain(|entry| entry.local_id.as_ref().is_some_and(|id| seen.contains(id)));
    Ok(())
}

pub(super) fn shows_behind<'a>(items: impl IntoIterator<Item = &'a MediaItem>) -> Vec<String> {
    items
        .into_iter()
        .filter(|item| item.kind == Kind::Episode)
        .filter_map(|item| item.show_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect()
}

pub(super) async fn ratings_of_shows(
    state: &SharedState,
    viewer: &Viewer,
    show_ids: Vec<String>,
) -> Result<ShowRatings, Response> {
    if !viewer.is_held() || show_ids.is_empty() {
        return Ok(ShowRatings::new());
    }
    query(&state.db, move |pool| db::shows_access(&pool, &show_ids)).await
}
