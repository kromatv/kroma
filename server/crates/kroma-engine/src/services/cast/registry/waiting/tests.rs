use super::*;
use crate::services::cast::registry::test_support::{announce_ok, beat};

fn play(item_id: &str) -> CastCommand {
    CastCommand::Play {
        item_id: item_id.into(),
        position_ms: 0,
    }
}

#[test]
fn a_held_play_is_handed_to_the_television_when_it_arrives() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].seq, 1);
    assert_eq!(commands[0].command, play("film-1"));
}

#[test]
fn it_is_handed_over_once() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    let commands = announce_ok(&reg, beat("tv-salon-01", 1, None), "u1", None);

    assert!(commands.is_empty());
}

#[test]
fn a_newer_order_replaces_the_one_that_was_waiting() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));
    reg.hold("tv-salon-01", "u1", play("film-2"));

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].command, play("film-2"));
}

#[test]
fn a_set_that_arrives_under_another_account_gets_nothing() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u2", None);

    assert!(commands.is_empty());
}

#[test]
fn a_television_that_was_already_there_keeps_its_own_inbox() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    reg.hold("tv-salon-01", "u1", play("film-1"));

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert!(commands.is_empty());
}

#[test]
fn the_order_is_numbered_after_what_the_set_already_applied() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));

    let commands = announce_ok(&reg, beat("tv-salon-01", 7, None), "u1", None);

    assert_eq!(commands[0].seq, 8);
}

#[test]
fn an_order_that_waited_too_long_is_dropped() {
    let reg = Registry::new();
    reg.hold("tv-salon-01", "u1", play("film-1"));
    reg.waiting
        .lock()
        .unwrap()
        .get_mut("tv-salon-01")
        .unwrap()
        .since = Instant::now() - WAITING_TTL - Duration::from_secs(1);

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert!(commands.is_empty());
}

#[test]
fn a_held_position_is_bounded_like_any_other() {
    let reg = Registry::new();
    reg.hold(
        "tv-salon-01",
        "u1",
        CastCommand::Play {
            item_id: "film-1".into(),
            position_ms: -5,
        },
    );

    let commands = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

    assert_eq!(commands[0].command, play("film-1"));
}
