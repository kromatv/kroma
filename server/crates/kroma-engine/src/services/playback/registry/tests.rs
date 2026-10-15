use super::test_support::{beat, ping, played_for, rewind, test_pool, watching};
use super::*;

#[test]
fn upsert_creates_then_refreshes() {
    let reg = Registry::default();
    assert_eq!(
        reg.upsert(
            ping("s1", 1000, "playing"),
            Some("u1".into()),
            "Alice".into(),
            "1.2.3.4".into(),
            "WAN".into(),
            None
        ),
        Beat::Opened
    );
    assert_eq!(
        reg.upsert(
            ping("s1", 5000, "paused"),
            Some("u1".into()),
            "Alice".into(),
            "1.2.3.4".into(),
            "LAN".into(),
            None
        ),
        Beat::Refreshed
    );
    let list = reg.list();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].position_ms, 5000);
    assert_eq!(list[0].state, "paused");
    assert_eq!(list[0].network, "LAN");
    assert!(reg.contains("s1"));
    assert!(!reg.contains("nope"));
}

#[test]
fn upsert_updates_audio_and_subtitle_labels() {
    let reg = Registry::new();
    beat(&reg, ping("s1", 0, "playing"), None);
    let mut p = ping("s1", 10, "playing");
    p.audio = Some("English 5.1".into());
    p.subtitle = Some("French".into());

    beat(&reg, p, None);

    let s = &reg.list()[0];
    assert_eq!(s.audio_label, "English 5.1");
    assert_eq!(s.subtitle, "French");
}

#[test]
fn remove_returns_session() {
    let reg = Registry::new();
    beat(&reg, ping("s1", 0, "playing"), None);

    let removed = reg.remove("s1");

    assert!(removed.is_some());
    assert_eq!(removed.unwrap().id, "s1");
    assert!(reg.remove("s1").is_none());
    assert!(reg.list().is_empty());
}

#[test]
fn terminate_removes_and_blocks_regrace() {
    let reg = Registry::new();
    beat(&reg, ping("s1", 0, "playing"), None);

    let ended = reg.terminate("s1");

    assert!(ended.is_some());
    assert!(reg.is_recently_terminated("s1"));
    assert!(!reg.is_recently_terminated("other"));
    assert!(reg.terminate("ghost").is_none());
    assert!(reg.is_recently_terminated("ghost"));
}

#[test]
fn user_online_reflects_live_sessions() {
    let reg = Registry::new();
    assert!(!reg.user_online("u1"));

    beat(&reg, ping("s1", 0, "playing"), Some("u1"));

    assert!(reg.user_online("u1"));
    assert!(!reg.user_online("u2"));
}

#[test]
fn list_sorts_newest_started_first() {
    let reg = Registry::new();
    beat(&reg, ping("old", 0, "playing"), None);
    beat(&reg, ping("new", 0, "playing"), None);
    // Same-second inserts would tie.
    {
        let mut map = reg.inner.write().unwrap();
        map.get_mut("old").unwrap().started_at = 100;
        map.get_mut("new").unwrap().started_at = 200;
    }

    let list = reg.list();

    assert_eq!(list[0].id, "new");
    assert_eq!(list[1].id, "old");
}

#[test]
fn stale_sessions_are_filtered_and_drained() {
    let reg = Registry::new();
    beat(&reg, ping("live", 0, "playing"), None);
    beat(&reg, ping("dead", 0, "playing"), Some("u9"));
    rewind(&reg, "dead", 120);

    assert_eq!(reg.list().len(), 1);
    assert!(!reg.user_online("u9"));
    let drained = reg.drain_stale();
    assert_eq!(drained.len(), 1);
    assert_eq!(drained[0].id, "dead");
    assert!(reg.contains("live"));
    assert!(!reg.contains("dead"));
}

#[test]
fn a_paused_stretch_is_not_counted_as_watching() {
    let reg = Registry::new();

    beat(&reg, ping("s1", 0, "paused"), None);
    rewind(&reg, "s1", 20);
    beat(&reg, ping("s1", 0, "paused"), None);

    assert_eq!(reg.inner.read().unwrap()["s1"].played_ms, 0);
}

#[test]
fn only_the_viewer_of_a_session_can_end_it() {
    let reg = Registry::new();
    beat(&reg, ping("s1", 0, "playing"), Some("u1"));
    beat(&reg, ping("anon", 0, "playing"), None);

    assert!(
        reg.remove_owned("s1", "u2").is_none(),
        "another account cannot end it"
    );
    assert!(
        reg.remove_owned("ghost", "u1").is_none(),
        "and an unknown id is indistinguishable"
    );
    assert!(
        reg.remove_owned("anon", "u1").is_none(),
        "nor can anyone claim a signed-out session"
    );
    assert_eq!(
        reg.remove_owned("s1", "u1").map(|s| s.id),
        Some("s1".to_string())
    );
    assert!(reg.remove_owned("s1", "u1").is_none());
    assert!(reg.contains("anon"));
}

#[test]
fn only_the_viewer_of_a_session_can_refresh_it() {
    let reg = Registry::new();
    reg.upsert(
        ping("s1", 1000, "playing"),
        Some("u1".into()),
        "Alice".into(),
        "10.0.0.1".into(),
        "LAN".into(),
        None,
    );
    beat(&reg, ping("anon", 0, "playing"), None);

    let stolen = reg.upsert(
        ping("s1", 9000, "paused"),
        Some("u2".into()),
        "Bob".into(),
        "8.8.8.8".into(),
        "WAN".into(),
        None,
    );
    let claimed = reg.upsert(
        ping("anon", 9000, "paused"),
        Some("u1".into()),
        "Alice".into(),
        "8.8.8.8".into(),
        "WAN".into(),
        None,
    );

    assert_eq!(stolen, Beat::Refused, "another account wrote it");
    assert_eq!(claimed, Beat::Refused, "a signed-out session was claimed");
    let live = reg.inner.read().unwrap();
    let mine = &live["s1"];
    assert_eq!(mine.username, "Alice");
    assert_eq!(mine.position_ms, 1000);
    assert_eq!(mine.state, "playing");
    assert_eq!(mine.ip, "10.0.0.1");
    assert_eq!(mine.network, "LAN");
    assert_eq!(live["anon"].position_ms, 0);
}

async fn let_the_reaper_sweep() {
    tokio::task::yield_now().await;
    tokio::time::advance(REAP_INTERVAL * 2).await;
    tokio::task::yield_now().await;
}

#[tokio::test(start_paused = true)]
async fn the_reaper_ends_stale_sessions_and_writes_them_to_history() {
    let pool = test_pool();
    let events = Bus::new();
    let mut seen = events.subscribe();
    let reg = Registry::new();
    beat(&reg, ping("live", 0, "playing"), None);
    played_for(&reg, "dead", 5, None);
    rewind(&reg, "dead", 120);

    reg.spawn_reaper(Pool::clone(&pool), events);
    let_the_reaper_sweep().await;

    let stopped = seen.try_recv().expect("the end of a session is announced");
    let payload = stopped.payload_unrouted();
    assert!(payload.contains("playback.stopped"), "{payload}");
    assert!(!reg.contains("dead"));
    assert!(reg.contains("live"));
    let logged: i64 = pool
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM play_history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(logged, 1);

    let_the_reaper_sweep().await;
    assert!(
        seen.try_recv().is_err(),
        "a sweep that finds nothing says nothing"
    );
}

#[test]
fn a_live_watch_session_names_its_watch_where_an_item_id_would_be() {
    let reg = Registry::new();
    beat(&reg, watching("w1", 0), Some("u1"));

    let listed = serde_json::to_value(reg.list()).unwrap();

    assert_eq!(listed[0]["watch"]["id"], "dl1");
    assert_eq!(listed[0]["title"], "Kaamelott");
    assert_eq!(listed[0]["kind"], "episode");
    assert!(listed[0].get("itemId").is_none());
}
