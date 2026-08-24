use super::*;
use crate::model::CastState;
use crate::services::cast::registry::test_support::{announce_ok, beat, item, playing};
use crate::services::cast::registry::MAX_RECEIVERS;

#[test]
fn a_receiver_appears_with_what_it_is_playing() {
    let reg = Registry::new();
    assert!(reg.wants_item("tv-salon-01", "it1"));
    announce_ok(
        &reg,
        beat("tv-salon-01", 0, Some(playing("it1", 1000))),
        "u1",
        Some(item("it1")),
    );
    assert!(!reg.wants_item("tv-salon-01", "it1"));
    assert!(reg.wants_item("tv-salon-01", "it2"));

    let list = reg.list("u1");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "Salon");
    let np = list[0].now_playing.as_ref().expect("now playing");
    assert_eq!(np.item.id, "it1");
    assert_eq!(np.position_ms, 1000);
    assert_eq!(
        reg.row("tv-salon-01").map(|r| r.name),
        Some("Salon".to_string())
    );
}

#[test]
fn another_account_never_sees_nor_drives_a_receiver() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert!(
        reg.list("u2").is_empty(),
        "the roster is scoped to the signed-in account"
    );
    // `None`, not `Some(false)`: the caller answers 404, so a stranger cannot
    // even learn the id exists.
    assert_eq!(reg.may_command("tv-salon-01", "u2"), None);
    assert!(reg
        .attach_controller("tv-salon-01", "sock-x", "iPhone", "u2", "bob", None)
        .is_none());
    assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));
}

#[test]
fn going_idle_clears_the_title() {
    let reg = Registry::new();
    announce_ok(
        &reg,
        beat("tv-salon-01", 0, Some(playing("it1", 10))),
        "u1",
        Some(item("it1")),
    );
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    assert!(reg.list("u1")[0].now_playing.is_none());
    assert!(reg.wants_item("tv-salon-01", "it1"));
}

#[test]
fn another_account_cannot_claim_a_registered_receiver() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    assert!(matches!(
        reg.announce(
            beat("tv-salon-01", 0, None),
            "u2",
            "Bob",
            "LAN".into(),
            None
        ),
        Announced::Taken
    ));
    assert_eq!(reg.owner_of("tv-salon-01").as_deref(), Some("u1"));
}

#[test]
fn the_roster_is_bounded() {
    let reg = Registry::new();
    for n in 0..MAX_RECEIVERS {
        announce_ok(&reg, beat(&format!("tv-{n:04}-xxxx"), 0, None), "u1", None);
    }
    assert!(matches!(
        reg.announce(
            beat("tv-9999-xxxx", 0, None),
            "u1",
            "Alice",
            "LAN".into(),
            None
        ),
        Announced::Full
    ));
    assert_eq!(reg.list("u1").len(), MAX_RECEIVERS);
}

#[test]
fn roster_changes_are_announced_but_a_scrub_is_not() {
    let reg = Registry::new();
    let changed = |a: Announce, item: Option<MediaItem>| match reg.announce(
        a,
        "u1",
        "Alice",
        "LAN".into(),
        item,
    ) {
        Announced::Ok { changed, .. } => changed,
        _ => panic!("accepted"),
    };
    assert!(changed(
        beat("tv-salon-01", 0, Some(playing("it1", 0))),
        Some(item("it1"))
    ));
    // Position alone moving is not a roster change: it rides cast.position.
    assert!(!changed(
        beat("tv-salon-01", 0, Some(playing("it1", 30_000))),
        None
    ));
    assert!(changed(
        beat("tv-salon-01", 0, Some(playing("it2", 0))),
        Some(item("it2"))
    ));
    let mut paused = playing("it2", 100);
    paused.state = CastState::Paused;
    assert!(changed(beat("tv-salon-01", 0, Some(paused)), None));
}

#[test]
fn display_strings_are_capped_and_stripped() {
    let reg = Registry::new();
    let mut ann = beat("tv-salon-01", 0, None);
    ann.name = format!("  Sa\u{7}lon{}  ", "x".repeat(200));
    ann.platform = "tv\nOS".into();
    announce_ok(&reg, ann, "u1", None);
    let row = &reg.list("u1")[0];
    assert!(
        !row.name.contains('\u{7}'),
        "control chars are stripped: {:?}",
        row.name
    );
    assert!(row.name.len() <= MAX_NAME);
    assert_eq!(row.platform, "tvOS");
}

#[test]
fn a_socket_attaches_a_receiver_and_reports_only_what_changed() {
    let reg = Registry::new();
    let hello = || Hello {
        receiver_id: "tv-salon-01".into(),
        name: "Salon".into(),
        platform: "Apple TV".into(),
    };
    assert!(matches!(
        reg.attach(hello(), "u1", "Alice", "LAN".into()),
        Announced::Ok { .. }
    ));
    assert_eq!(reg.list("u1").len(), 1);

    let change = reg.set_state("tv-salon-01", Some(playing("it1", 0)), Some(item("it1")));
    assert!(matches!(change, Some(StateChange::Row(_))));

    let change = reg.set_state("tv-salon-01", Some(playing("it1", 30_000)), None);
    match change {
        Some(StateChange::Position {
            position_ms, state, ..
        }) => {
            assert_eq!(position_ms, 30_000);
            assert_eq!(state, CastState::Playing);
        }
        _ => panic!("a position-only update must not broadcast a row"),
    }

    let mut paused = playing("it1", 30_000);
    paused.state = CastState::Paused;
    assert!(matches!(
        reg.set_state("tv-salon-01", Some(paused), None),
        Some(StateChange::Row(_))
    ));

    assert!(matches!(
        reg.set_state("tv-salon-01", None, None),
        Some(StateChange::Row(_))
    ));
    assert!(reg.list("u1")[0].now_playing.is_none());

    assert!(matches!(
        reg.set_state("tv-salon-01", None, None),
        Some(StateChange::Nothing)
    ));
    assert!(reg.set_state("tv-ghost-01", None, None).is_none());
}
