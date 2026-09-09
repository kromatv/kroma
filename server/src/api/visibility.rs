//! Enforces per-user library visibility (ACCT-20, ACCT-21) on the catalogue
//! handlers: a title in a library the caller was not granted is absent from
//! every listing and unreachable by its id.

use std::collections::HashSet;

use axum::http::StatusCode;
use axum::response::Response;

use crate::api::error::json_error;
use crate::api::util::query;
use crate::db;
use crate::model::{MediaItem, Section, SectionItem, Show, User};
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
/// titled row with nothing in it announces what was removed.
pub fn keep_sections(user: &User, sections: &mut Vec<Section>) {
    if user.sees_every_library() {
        return;
    }
    for section in sections.iter_mut() {
        section
            .items
            .retain(|entry| user.sees_library(library_of(entry)));
    }
    sections.retain(|section| !section.items.is_empty());
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
mod tests {
    use super::*;
    use crate::model::{LibraryScope, Permission};

    fn viewer(libraries: LibraryScope) -> User {
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "alice".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: vec![Permission::Playback],
            libraries,
            created_at: String::new(),
            has_pin: false,
        }
    }

    fn movie() -> MediaItem {
        crate::services::demo::demo_data()
            .items
            .into_iter()
            .find(|i| i.show_id.is_none())
            .expect("demo movie")
    }

    fn episode() -> MediaItem {
        crate::services::demo::demo_data()
            .items
            .into_iter()
            .find(|i| i.show_id.is_some())
            .expect("demo episode")
    }

    fn series() -> Show {
        crate::services::demo::demo_data()
            .shows
            .into_iter()
            .next()
            .expect("demo show")
    }

    fn only_films() -> User {
        viewer(LibraryScope::Only(vec![movie().library]))
    }

    #[test]
    fn a_listing_keeps_only_what_the_grant_names() {
        let alice = only_films();
        let mut items = vec![movie(), episode()];
        let mut shows = vec![series()];

        keep_items(&alice, &mut items);
        keep_shows(&alice, &mut shows);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, movie().id);
        assert!(shows.is_empty());
    }

    #[test]
    fn an_unrestricted_account_keeps_every_row_untouched() {
        let owner = viewer(LibraryScope::All);
        let mut items = vec![movie(), episode()];

        keep_items(&owner, &mut items);

        assert_eq!(items.len(), 2);
    }

    #[test]
    fn a_rail_emptied_by_the_grant_is_dropped_rather_than_shown_bare() {
        let alice = only_films();
        let mut sections = vec![
            Section {
                id: "mixed".into(),
                title: "Mixed".into(),
                reason: None,
                items: vec![
                    SectionItem::Movie {
                        item: Box::new(movie()),
                    },
                    SectionItem::Show {
                        show: Box::new(series()),
                    },
                ],
            },
            Section {
                id: "hidden".into(),
                title: "Hidden".into(),
                reason: None,
                items: vec![SectionItem::Show {
                    show: Box::new(series()),
                }],
            },
        ];

        keep_sections(&alice, &mut sections);

        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, "mixed");
        assert_eq!(sections[0].items.len(), 1);
    }

    #[test]
    fn a_hero_pick_outside_the_grant_becomes_no_pick_at_all() {
        let alice = only_films();

        let kept = keep_section_item(
            &alice,
            Some(SectionItem::Movie {
                item: Box::new(movie()),
            }),
        );
        let dropped = keep_section_item(
            &alice,
            Some(SectionItem::Show {
                show: Box::new(series()),
            }),
        );

        assert!(kept.is_some());
        assert!(dropped.is_none());
    }
}
