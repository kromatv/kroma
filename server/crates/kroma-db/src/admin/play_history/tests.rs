use super::*;
use crate::admin::test_support::*;

fn since(at: i64) -> PlayFilter {
    PlayFilter {
        since: at,
        ..PlayFilter::default()
    }
}

#[test]
fn the_log_keeps_the_device_and_the_treatment_the_stream_got() {
    let p = pool();

    record_play(
        &p,
        &PlayRecord {
            device: Some("Chrome · Windows".into()),
            player: Some("web".into()),
            mode: Some("transcode".into()),
            network: Some("WAN".into()),
            video_label: Some("1080p · H.265".into()),
            audio_label: Some("Surround · 5.1 · DTS".into()),
            show_title: Some("Severance".into()),
            season: Some(2),
            episode: Some(4),
            library: Some("lib-tv".into()),
            ..play("u1", "alice", "Chikhai Bardo", "episode", 42_000)
        },
    )
    .unwrap();

    let row = &plays(&p, &since(0), 50, 0).unwrap()[0];

    assert_eq!(row.device.as_deref(), Some("Chrome · Windows"));
    assert_eq!(row.mode.as_deref(), Some("transcode"));
    assert_eq!(row.network.as_deref(), Some("WAN"));
    assert_eq!(row.show_title.as_deref(), Some("Severance"));
    assert_eq!(row.library.as_deref(), Some("lib-tv"));
    assert_eq!((row.season, row.episode), (Some(2), Some(4)));
    assert_eq!(row.watched_ms, 42_000);
}

#[test]
fn the_log_reads_newest_first_and_pages() {
    let p = pool();
    for (title, ended) in [("first", 100), ("second", 200), ("third", 300)] {
        record_play(
            &p,
            &PlayRecord {
                ended_at: ended,
                ..play("u1", "alice", title, "movie", 1)
            },
        )
        .unwrap();
    }

    let page = plays(&p, &since(0), 2, 0).unwrap();

    assert_eq!(
        page.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(),
        ["third", "second"]
    );
    assert_eq!(plays(&p, &since(0), 2, 2).unwrap()[0].title, "first");
    assert_eq!(plays_count(&p, &since(0)).unwrap(), 3);
    assert_eq!(plays_count(&p, &since(1000)).unwrap(), 0);
}

#[test]
fn one_members_log_holds_only_their_own_plays() {
    let p = pool();
    record_play(&p, &play("u1", "alice", "Dune", "movie", 1)).unwrap();
    record_play(&p, &play("u2", "bob", "Arrival", "movie", 1)).unwrap();
    let mine = PlayFilter {
        user: Some("u1".into()),
        ..PlayFilter::default()
    };

    let alice = plays(&p, &mine, 50, 0).unwrap();

    assert_eq!(alice.len(), 1);
    assert_eq!(alice[0].title, "Dune");
    assert_eq!(plays_count(&p, &mine).unwrap(), 1);
}

#[test]
fn a_show_id_matches_every_episode_of_that_show() {
    let p = pool();
    seed_show(&p, "sev", "lib-tv", "Severance", 2022);
    seed_episode(&p, "ep1", "sev", "lib-tv", "Good News About Hell");
    seed_episode(&p, "ep2", "sev", "lib-tv", "Half Loop");
    seed_movie(&p, "dune", "lib-films", "Dune", 2021);
    for item in ["ep1", "ep2", "dune"] {
        record_play(
            &p,
            &PlayRecord {
                item_id: Some(item.into()),
                ..play("u1", "alice", item, "episode", 1)
            },
        )
        .unwrap();
    }
    let show = PlayFilter {
        item_or_show: Some("sev".into()),
        ..PlayFilter::default()
    };

    let episodes = plays(&p, &show, 50, 0).unwrap();

    assert_eq!(episodes.len(), 2);
    assert_eq!(plays_count(&p, &show).unwrap(), 2);
    assert_eq!(
        plays_count(
            &p,
            &PlayFilter {
                item_or_show: Some("ep1".into()),
                ..PlayFilter::default()
            }
        )
        .unwrap(),
        1
    );
}

#[test]
fn a_row_logged_before_the_library_was_recorded_still_answers_the_filter() {
    let p = pool();
    seed_movie(&p, "dune", "lib-films", "Dune", 2021);
    seed_library(&p, "lib-tv", "Séries");
    record_play(
        &p,
        &PlayRecord {
            item_id: Some("dune".into()),
            library: None,
            ..play("u1", "alice", "Dune", "movie", 1)
        },
    )
    .unwrap();
    let films = PlayFilter {
        library: Some("lib-films".into()),
        ..PlayFilter::default()
    };

    let rows = plays(&p, &films, 50, 0).unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].library.as_deref(), Some("lib-films"));
    assert_eq!(
        plays_count(
            &p,
            &PlayFilter {
                library: Some("lib-tv".into()),
                ..PlayFilter::default()
            }
        )
        .unwrap(),
        0
    );
}

#[test]
fn the_library_filter_lists_only_libraries_the_log_names() {
    let p = pool();
    seed_library(&p, "lib-films", "Films");
    seed_library(&p, "lib-empty", "Jamais lue");
    seed_movie(&p, "dune", "lib-films", "Dune", 2021);
    record_play(
        &p,
        &PlayRecord {
            item_id: Some("dune".into()),
            ..play("u1", "alice", "Dune", "movie", 1)
        },
    )
    .unwrap();

    let libraries = history_libraries(&p).unwrap();

    assert_eq!(libraries.len(), 1);
    assert_eq!(libraries[0].id, "lib-films");
    assert_eq!(libraries[0].name, "Films");
}

#[test]
fn the_table_orders_by_the_column_the_reader_picked() {
    let p = pool();
    for (title, watched) in [("Arrival", 30_000), ("Dune", 10_000), ("Sicario", 20_000)] {
        record_play(&p, &play("u1", "alice", title, "movie", watched)).unwrap();
    }
    let by_length = PlayFilter {
        sort: PlaySort::parse("watchedMs:asc").unwrap(),
        ..PlayFilter::default()
    };

    let rows = plays(&p, &by_length, 50, 0).unwrap();

    assert_eq!(
        rows.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(),
        ["Dune", "Sicario", "Arrival"]
    );
}
