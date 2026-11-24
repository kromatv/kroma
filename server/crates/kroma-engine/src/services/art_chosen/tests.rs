use super::*;
use crate::db::art_beside::{BACKDROP, POSTER};
use crate::db::metadata_core::ITEM;
use crate::test_support::{seed_movie, seed_show_episode, test_state};

fn slot<'a>(kind: &'a str, id: &'a str, role: &'a str) -> Slot<'a> {
    Slot { kind, id, role }
}

#[test]
fn a_picture_for_a_title_that_does_not_exist_is_refused() {
    let state = test_state();

    let choice = choose(&state, slot(ITEM, "ghost", POSTER), b"picture").unwrap();

    assert_eq!(choice, Choice::NoSuchTitle);
    assert_eq!(
        db::art_chosen::chosen(&state.db, ITEM, "ghost").unwrap(),
        Default::default()
    );
}

#[test]
fn bytes_that_are_not_a_picture_are_refused() {
    let state = test_state();
    seed_movie(&state, "m1");

    let choice = choose(&state, slot(ITEM, "m1", BACKDROP), b"not-an-image").unwrap();

    assert_eq!(choice, Choice::Unreadable);
    assert_eq!(
        db::art_chosen::chosen(&state.db, ITEM, "m1")
            .unwrap()
            .backdrop,
        None
    );
}

#[test]
fn resetting_a_title_that_does_not_exist_says_so() {
    let state = test_state();

    assert!(!reset(&state, slot(SHOW, "ghost", POSTER)).unwrap());
}

#[test]
fn resetting_a_show_tells_every_client_to_load_it_again() {
    let state = test_state();
    seed_show_episode(&state, "sh1", "e1");
    db::art_chosen::choose(
        &state.db,
        slot(SHOW, "sh1", POSTER),
        "/api/images/chosen-a.webp",
    )
    .unwrap();
    let mut events = state.events.subscribe();

    let reset = reset(&state, slot(SHOW, "sh1", POSTER)).unwrap();

    let sent = events.try_recv().expect("an event");
    assert!(reset);
    assert_eq!(
        db::art_chosen::chosen(&state.db, SHOW, "sh1")
            .unwrap()
            .poster,
        None
    );
    assert!(sent.payload_for("anyone").unwrap().contains("\"sh1\""));
}
