use super::super::test_support::{beat, beat_apart, played_for, ping, test_pool, watching};
use super::super::Registry;
use super::*;

fn film_in(library: &str) -> crate::model::MediaItem {
    crate::model::MediaItem {
        id: "item1".into(),
        title: "The Film".into(),
        kind: crate::model::Kind::Movie,
        year: Some(2020),
        duration_ms: Some(7_200_000),
        container: "mkv".into(),
        video: None,
        audio: None,
        audio_tracks: Vec::new(),
        subtitles: Vec::new(),
        library: library.into(),
        show_id: None,
        show_title: None,
        season: None,
        episode: None,
        episode_end: None,
        episode_title: None,
        rel_path: None,
        added_at: "t".into(),
        metadata: None,
        abs_path: None,
        files: Vec::new(),
        editions: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

#[test]
fn the_log_records_the_library_the_title_came_from() {
    let pool = test_pool();
    let reg = Registry::new();
    played_for(&reg, "s1", 5, Some(&film_in("cinema")));
    let session = reg.remove("s1").unwrap();

    record(&pool, &session);

    let library: Option<String> = pool
        .get()
        .unwrap()
        .query_row("SELECT library FROM play_history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(library.as_deref(), Some("cinema"));
}

#[test]
fn a_session_that_never_played_is_not_a_viewing() {
    let pool = test_pool();
    let reg = Registry::new();

    beat(&reg, ping("ghost", 0, "playing"), Some("u1"));
    record(&pool, &reg.remove("ghost").expect("the session was opened"));

    let count: i64 = pool
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM play_history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0, "one beat and silence is a reaped tab, not a play");
}

#[test]
fn the_log_counts_the_time_played_rather_than_the_time_open() {
    let pool = test_pool();
    let reg = Registry::new();

    played_for(&reg, "s1", 12, None);
    record(&pool, &reg.remove("s1").expect("the session played"));

    let watched: i64 = pool
        .get()
        .unwrap()
        .query_row("SELECT watched_ms FROM play_history", [], |r| r.get(0))
        .unwrap();
    assert!(
        (11_000..=13_000).contains(&watched),
        "twelve seconds of playing, not the session's wall clock: {watched}"
    );
}

#[test]
fn record_appends_to_play_history() {
    let pool = test_pool();
    let reg = Registry::new();
    played_for(&reg, "s1", 5, None);
    let session = reg.remove("s1").unwrap();

    record(&pool, &session);

    let count: i64 = pool
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM play_history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn a_watch_session_is_logged_without_a_catalogue_item() {
    let pool = test_pool();
    let reg = Registry::new();
    beat_apart(&reg, "w1", 5, None, |pos| watching("w1", pos));

    record(&pool, &reg.remove("w1").expect("the session played"));

    let (item, title, season): (Option<String>, String, Option<u32>) = pool
        .get()
        .unwrap()
        .query_row(
            "SELECT item_id, show_title, season FROM play_history",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(item, None);
    assert_eq!(title, "Kaamelott");
    assert_eq!(season, Some(1));
}

#[test]
fn unix_now_is_positive() {
    assert!(unix_now() > 1_600_000_000);
}
