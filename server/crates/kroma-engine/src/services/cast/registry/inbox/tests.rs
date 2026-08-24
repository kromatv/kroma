use std::time::{Duration, Instant};

use super::*;
use crate::services::cast::registry::test_support::{announce_ok, beat};
use crate::services::cast::registry::Hello;

#[test]
fn commands_replay_until_they_are_acked() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    let first = reg
        .enqueue("tv-salon-01", "u1", CastCommand::Pause)
        .expect("queued");
    let second = reg
        .enqueue("tv-salon-01", "u1", CastCommand::Seek { position_ms: 5000 })
        .expect("queued");
    assert_eq!((first.seq, second.seq), (1, 2));

    let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    assert_eq!(pending.len(), 2);
    let pending = announce_ok(&reg, beat("tv-salon-01", 1, None), "u1", None);
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].seq, 2);
    assert!(announce_ok(&reg, beat("tv-salon-01", 2, None), "u1", None).is_empty());
    assert_eq!(
        reg.enqueue("tv-salon-01", "u1", CastCommand::Stop)
            .unwrap()
            .seq,
        3
    );
}

#[test]
fn the_inbox_is_bounded_and_keeps_the_freshest() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    for _ in 0..(MAX_INBOX + 5) {
        reg.enqueue("tv-salon-01", "u1", CastCommand::Pause);
    }
    let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    assert_eq!(pending.len(), MAX_INBOX);
    assert_eq!(pending.last().unwrap().seq, (MAX_INBOX + 5) as u64);
}

#[test]
fn commands_for_an_unknown_or_dead_receiver_are_refused() {
    let reg = Registry::new();
    assert!(reg
        .enqueue("tv-ghost-01", "u1", CastCommand::Pause)
        .is_none());
    assert!(reg.owner_of("tv-ghost-01").is_none());
    reg.ack("tv-ghost-01", 1);
    reg.touch("tv-ghost-01");
    assert!(
        reg.row("tv-ghost-01").is_none(),
        "acking a stranger does not create it"
    );

    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    {
        let mut map = reg.inner.write().unwrap();
        map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(120);
    }
    assert!(reg
        .enqueue("tv-salon-01", "u1", CastCommand::Pause)
        .is_none());
    assert!(reg.list("u1").is_empty());
    assert_eq!(
        reg.reap(),
        vec![("tv-salon-01".to_string(), "u1".to_string())]
    );
    assert!(reg.reap().is_empty());
}

#[test]
fn a_socket_acks_by_sequence_and_keeps_itself_alive() {
    let reg = Registry::new();
    reg.attach(
        Hello {
            receiver_id: "tv-salon-01".into(),
            name: "Salon".into(),
            platform: "tvOS".into(),
        },
        "u1",
        "Alice",
        "LAN".into(),
    );
    reg.enqueue("tv-salon-01", "u1", CastCommand::Pause);
    reg.enqueue("tv-salon-01", "u1", CastCommand::Stop);
    reg.ack("tv-salon-01", 1);
    let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].seq, 2);

    {
        let mut map = reg.inner.write().unwrap();
        map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(40);
    }
    reg.touch("tv-salon-01");
    assert!(reg.reap().is_empty());
    assert_eq!(reg.list("u1").len(), 1);
}

#[test]
fn positions_are_clamped_before_they_reach_the_tv() {
    let reg = Registry::new();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    let seek = reg
        .enqueue("tv-salon-01", "u1", CastCommand::Seek { position_ms: -5 })
        .unwrap();
    assert_eq!(seek.command, CastCommand::Seek { position_ms: 0 });
    let skip = reg
        .enqueue(
            "tv-salon-01",
            "u1",
            CastCommand::Skip { delta_ms: i64::MIN },
        )
        .unwrap();
    assert_eq!(
        skip.command,
        CastCommand::Skip {
            delta_ms: -MAX_SKIP_MS
        }
    );
    let play = reg
        .enqueue(
            "tv-salon-01",
            "u1",
            CastCommand::Play {
                item_id: "it1".into(),
                position_ms: i64::MAX,
            },
        )
        .unwrap();
    assert_eq!(
        play.command,
        CastCommand::Play {
            item_id: "it1".into(),
            position_ms: MAX_SKIP_MS
        }
    );
}
