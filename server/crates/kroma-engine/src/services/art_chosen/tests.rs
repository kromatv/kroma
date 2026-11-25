use super::*;
use crate::db::art_beside::{BACKDROP, POSTER, SEASON};
use crate::db::metadata_core::{ITEM, SHOW};
use crate::infra::image::test_server::{answer, serve};
use crate::test_support::{seed_movie, seed_show_episode, test_state};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x02\x00\x00\x00\x03\x08\x02\x00\x00\x00\x36\x88\x49\xd6\x00\x00\x00\x10IDAT\x78\x9c\x63\xf8\xcf\xc0\x00\x44\x0c\x28\x14\x00\x44\xd0\x05\xfb\xa4\xcf\xde\x80\x00\x00\x00\x00IEND\xae\x42\x60\x82";

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
            .get(BACKDROP),
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
            .get(POSTER),
        None
    );
    assert!(sent.payload_for("anyone").unwrap().contains("\"sh1\""));
}

#[test]
fn a_poster_for_a_season_with_no_episode_on_disk_is_refused() {
    let state = test_state();
    seed_show_episode(&state, "sh1", "e1");

    let away = choose(&state, slot(SEASON, "sh1:2", POSTER), b"picture").unwrap();
    let unnumbered = choose(&state, slot(SEASON, "sh1", POSTER), b"picture").unwrap();
    let on_disk = choose(&state, slot(SEASON, "sh1:1", POSTER), b"picture").unwrap();

    assert_eq!(away, Choice::NoSuchTitle);
    assert_eq!(unnumbered, Choice::NoSuchTitle);
    assert_eq!(on_disk, Choice::Unreadable);
}

#[test]
fn resetting_a_season_tells_every_client_to_load_its_show_again() {
    let state = test_state();
    seed_show_episode(&state, "sh1", "e1");
    let mut events = state.events.subscribe();

    let reset = reset(&state, slot(SEASON, "sh1:1", POSTER)).unwrap();

    let sent = events.try_recv().expect("an event");
    assert!(reset);
    assert_eq!(
        sent.payload_for("anyone"),
        Some(r#"{"type":"show.updated","id":"sh1"}"#)
    );
}

#[test]
fn the_picture_a_link_serves_is_shown_as_an_upload_is() {
    let state = test_state();
    seed_movie(&state, "m1");
    let base = serve(|_| vec![answer("200 OK", "Content-Type: image/png\r\n", PNG)]);

    let choice = choose_link(
        &state,
        slot(ITEM, "m1", POSTER),
        &format!("{base}/poster.png"),
    )
    .unwrap();

    let chosen = db::art_chosen::chosen(&state.db, ITEM, "m1").unwrap();
    let shown = chosen.get(POSTER).expect("a chosen poster");
    assert!(shown.starts_with("/api/images/chosen-"));
    assert_eq!(choice, Choice::Shown(shown.clone()));
}

#[test]
fn a_link_that_serves_no_picture_is_refused() {
    let state = test_state();
    seed_movie(&state, "m1");
    let base = serve(|_| vec![answer("200 OK", "", b"not a picture")]);

    let unreachable = choose_link(&state, slot(ITEM, "m1", POSTER), "file:///etc/passwd").unwrap();
    let unreadable =
        choose_link(&state, slot(ITEM, "m1", POSTER), &format!("{base}/page")).unwrap();
    let ghost = choose_link(
        &state,
        slot(ITEM, "ghost", POSTER),
        "https://images.example/p.png",
    )
    .unwrap();

    assert_eq!(unreachable, Choice::Unreachable);
    assert_eq!(unreadable, Choice::Unreadable);
    assert_eq!(ghost, Choice::NoSuchTitle);
    assert_eq!(
        db::art_chosen::chosen(&state.db, ITEM, "m1").unwrap(),
        Default::default()
    );
}
