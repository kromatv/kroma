use std::time::{Duration, Instant};

use super::*;
use crate::services::cast::registry::test_support::{announce_ok, beat};

async fn let_the_reaper_sweep() {
    tokio::task::yield_now().await;
    tokio::time::advance(REAP_INTERVAL * 2).await;
    tokio::task::yield_now().await;
}

#[tokio::test(start_paused = true)]
async fn the_reaper_drops_a_receiver_that_stopped_beating_and_tells_its_owner() {
    let reg = Registry::new();
    let events = Bus::new();
    let mut seen = events.subscribe();
    announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
    announce_ok(&reg, beat("tv-chambre-02", 0, None), "u1", None);
    {
        let mut map = reg.inner.write().unwrap();
        map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(120);
    }

    reg.spawn_reaper(events);
    let_the_reaper_sweep().await;

    let gone = seen.try_recv().expect("the owner is told its receiver is gone");
    let payload = gone.payload_unrouted();
    assert!(payload.contains("cast.receiver.gone"), "{payload}");
    assert!(payload.contains("tv-salon-01"), "{payload}");
    assert!(gone.visible_to("u1"));
    assert!(!gone.visible_to("u2"), "another account is not told about this set");
    assert!(reg.row("tv-salon-01").is_none());
    assert!(reg.row("tv-chambre-02").is_some());

    let_the_reaper_sweep().await;
    assert!(seen.try_recv().is_err(), "a sweep that finds nothing says nothing");
}
