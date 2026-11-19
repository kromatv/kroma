use std::time::{Duration, Instant};

use super::super::*;

fn library_updates(
    events: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
) -> usize {
    let mut updates = 0;
    while let Ok(envelope) = events.try_recv() {
        assert!(envelope.payload_unrouted().contains("library.updated"));
        updates += 1;
    }
    updates
}

#[test]
fn a_batch_that_wrote_nothing_is_not_announced() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);

    announcer.wrote(0);

    assert_eq!(library_updates(&mut events), 0);
}

#[test]
fn batches_written_in_quick_succession_are_announced_once() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);

    announcer.wrote(3);
    announcer.wrote(2);

    assert_eq!(library_updates(&mut events), 1);
}

#[test]
fn a_batch_held_back_is_announced_with_the_next_one_that_is_due() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);
    let start = Instant::now();

    announcer.wrote_at(3, start);
    announcer.wrote_at(2, start + Duration::from_secs(1));
    let held_back = library_updates(&mut events);
    announcer.wrote_at(0, start + Duration::from_secs(3));

    assert_eq!(held_back, 1);
    assert_eq!(library_updates(&mut events), 1);
}
