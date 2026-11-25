use super::*;
use crate::db::metadata_core::{ITEM, SHOW};
use crate::test_support::{seed_movie, seed_show_episode, test_state};

fn film(id: &str) -> Title<'_> {
    Title { kind: ITEM, id }
}

fn named(title: &str) -> TitleEdit {
    TitleEdit {
        title: Some(title.into()),
        ..Default::default()
    }
}

#[test]
fn a_name_for_a_title_that_does_not_exist_is_refused() {
    let state = test_state();

    let edit = write(&state, film("ghost"), named("Heat")).unwrap();

    assert_eq!(edit, Edit::NoSuchTitle);
    assert!(db::title_edits::written(
        &state.db,
        Title {
            kind: ITEM,
            id: "ghost"
        }
    )
    .unwrap()
    .is_empty());
}

#[test]
fn a_name_longer_than_a_title_holds_is_refused_and_nothing_is_kept() {
    let state = test_state();
    seed_movie(&state, "m1");
    let long = named(&"a".repeat(crate::model::title_edit::TITLE_MAX + 1));

    let edit = write(&state, film("m1"), long).unwrap();

    assert_eq!(edit, Edit::DoesNotFit);
    assert!(db::title_edits::written(
        &state.db,
        Title {
            kind: ITEM,
            id: "m1"
        }
    )
    .unwrap()
    .is_empty());
}

#[test]
fn a_name_is_kept_trimmed_and_search_finds_the_title_under_it() {
    let state = test_state();
    seed_movie(&state, "m1");
    let mut events = state.events.subscribe();

    let edit = write(&state, film("m1"), named("  Home movies  ")).unwrap();
    state.search.reindex_from_db(&state.db).unwrap();

    let sent = events.try_recv().expect("an event");
    let hits = state.search.search("Home movies", 5);
    assert_eq!(edit, Edit::Kept(Box::new(named("Home movies"))));
    assert_eq!(hits.first().map(|h| h.id.as_str()), Some("m1"));
    assert!(sent.payload_for("anyone").unwrap().contains("\"m1\""));
}

#[test]
fn an_edit_left_empty_hands_a_show_back_to_the_provider() {
    let state = test_state();
    seed_show_episode(&state, "sh1", "e1");
    let show = Title {
        kind: SHOW,
        id: "sh1",
    };
    write(&state, show, named("Our show")).unwrap();

    let edit = write(&state, show, named("   ")).unwrap();

    assert_eq!(edit, Edit::Kept(Box::default()));
    assert!(db::title_edits::written(
        &state.db,
        Title {
            kind: SHOW,
            id: "sh1"
        }
    )
    .unwrap()
    .is_empty());
}
