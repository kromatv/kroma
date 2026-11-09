use super::*;
use crate::model::Permission;

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
    let sections = Arc::new(vec![
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
    ]);

    let sections = keep_sections(&alice, sections);

    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].id, "mixed");
    assert_eq!(sections[0].items.len(), 1);
}

#[test]
fn an_unrestricted_account_is_handed_the_shared_rails_themselves() {
    let owner = viewer(LibraryScope::All);
    let shared = Arc::new(vec![Section {
        id: "for-you".into(),
        title: "For you".into(),
        reason: None,
        items: Vec::new(),
    }]);

    let kept = keep_sections(&owner, Arc::clone(&shared));

    assert!(Arc::ptr_eq(&kept, &shared));
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
