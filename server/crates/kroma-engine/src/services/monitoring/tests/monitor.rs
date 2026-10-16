use super::*;

#[test]
fn a_show_monitored_for_the_first_time_takes_every_episode() {
    let host = host();
    let _tmdb = tmdb();
    exec(&host, "INSERT INTO users (id,email,username,password_hash,permissions,created_at) VALUES ('u1','a@b.c','alice','h','[]','t')");

    let title = monitor(&host, RequestKind::Show, SHOW, &MonitorBody::default(), Some("u1")).unwrap();

    assert_eq!(title.seasons, [1, 2]);
    assert!(title.monitor_new_seasons);
    assert_eq!(title.original_language.as_deref(), Some("en-US"));
    assert_eq!(units(&host, RequestKind::Show, SHOW).len(), 4);
    assert_eq!(monitored(&host, RequestKind::Show, SHOW).unwrap().added_by.as_deref(), Some("u1"));
}

#[test]
fn an_episode_already_on_disk_is_monitored_as_available() {
    let host = host();
    let _tmdb = tmdb();
    seed_show_on_disk(&host, &[(1, 1)]);

    monitor(&host, RequestKind::Show, SHOW, &MonitorBody::default(), None).unwrap();

    assert!(units(&host, RequestKind::Show, SHOW).contains(&(Some(1), Some(1), wanted("available"))));
}

#[test]
fn the_missing_preset_leaves_out_what_is_on_disk() {
    let host = host();
    let _tmdb = tmdb();
    seed_show_on_disk(&host, &[(1, 1)]);

    monitor(&host, RequestKind::Show, SHOW, &with_preset(MonitorPreset::Missing), None).unwrap();

    let held: Vec<(Option<u32>, Option<u32>)> = units(&host, RequestKind::Show, SHOW)
        .into_iter()
        .map(|(s, e, _)| (s, e))
        .collect();
    assert_eq!(held, [(Some(1), Some(2)), (Some(2), Some(1)), (Some(2), Some(2))]);
}

#[test]
fn reapplying_a_preset_drops_what_it_no_longer_chooses() {
    let host = host();
    let _tmdb = tmdb();
    monitor(&host, RequestKind::Show, SHOW, &MonitorBody::default(), None).unwrap();

    let title = monitor(&host, RequestKind::Show, SHOW, &with_preset(MonitorPreset::Pilot), None).unwrap();

    assert_eq!(units(&host, RequestKind::Show, SHOW), [(Some(1), Some(1), wanted("wanted"))]);
    assert!(title.seasons.is_empty());
    assert!(!title.monitor_new_seasons);
}

#[test]
fn a_preset_never_takes_an_episode_from_an_open_request() {
    let host = host();
    let _tmdb = tmdb();
    monitor(&host, RequestKind::Show, SHOW, &with_preset(MonitorPreset::None), None).unwrap();
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: "r1".into(),
            kind: RequestKind::Show,
            tmdb_id: SHOW,
            title: "Show".into(),
            year: None,
            poster_url: None,
            seasons: Some(vec![2]),
            episodes: None,
            status: RequestStatus::Approved,
            requested_by: None,
        },
        1,
    )
    .unwrap();
    let asked = db::WantedRow {
        id: db::unit_id("episode", SHOW, Some(2), Some(1)),
        request_id: Some("r1".into()),
        kind: "episode".into(),
        tmdb_id: SHOW,
        imdb_id: None,
        title: "Show".into(),
        year: None,
        season: Some(2),
        episode: Some(1),
        air_date: None,
        status: "wanted".into(),
        last_search_at: None,
    };
    db::claim_wanted(host.db(), "r1", &[asked], 1).unwrap();

    monitor(&host, RequestKind::Show, SHOW, &with_preset(MonitorPreset::Pilot), None).unwrap();

    let held: Vec<(Option<u32>, Option<u32>)> = units(&host, RequestKind::Show, SHOW)
        .into_iter()
        .map(|(s, e, _)| (s, e))
        .collect();
    assert_eq!(held, [(Some(1), Some(1)), (Some(2), Some(1))]);
}

#[test]
fn an_explicit_new_seasons_switch_wins_over_the_preset() {
    let host = host();
    let _tmdb = tmdb();
    let body = MonitorBody {
        preset: Some(MonitorPreset::FirstSeason),
        monitor_new_seasons: Some(true),
        ..MonitorBody::default()
    };

    let title = monitor(&host, RequestKind::Show, SHOW, &body, None).unwrap();

    assert!(title.monitor_new_seasons);
    assert_eq!(title.seasons, [1]);
}

#[test]
fn searching_now_wakes_the_search() {
    let host = host();
    let _tmdb = tmdb();
    let body = MonitorBody {
        search_now: true,
        ..MonitorBody::default()
    };

    monitor(&host, RequestKind::Show, SHOW, &body, None).unwrap();

    assert!(host.jobs().iter().any(|(key, _)| *key == "acquisition.search"));
}

#[test]
fn a_movie_is_searched_from_its_minimum_availability() {
    let host = host();
    let _tmdb = tmdb();
    let in_cinemas = MonitorBody {
        min_availability: Some(MinAvailability::InCinemas),
        ..MonitorBody::default()
    };
    let announced = MonitorBody {
        min_availability: Some(MinAvailability::Announced),
        ..MonitorBody::default()
    };
    let date = |host: &StubHost| {
        let conn = host.db().get().unwrap();
        db::wanted_for_title(&conn, RequestKind::Movie, MOVIE).unwrap()[0].air_date.clone()
    };

    monitor(&host, RequestKind::Movie, MOVIE, &MonitorBody::default(), None).unwrap();
    let released = date(&host);
    monitor(&host, RequestKind::Movie, MOVIE, &in_cinemas, None).unwrap();
    let cinema = date(&host);
    monitor(&host, RequestKind::Movie, MOVIE, &announced, None).unwrap();
    let now = date(&host);

    assert_eq!(released.as_deref(), Some("1999-09-21"));
    assert_eq!(cinema.as_deref(), Some("1999-03-31"));
    assert_eq!(now, None);
    assert_eq!(units(&host, RequestKind::Movie, MOVIE).len(), 1);
}

#[test]
fn switching_a_season_off_unmonitors_its_episodes() {
    let host = host();
    let _tmdb = tmdb();
    monitor(&host, RequestKind::Show, SHOW, &MonitorBody::default(), None).unwrap();
    let body = EpisodeMonitoringBody {
        seasons: vec![SeasonSwitch {
            season: 2,
            monitored: false,
        }],
        ..EpisodeMonitoringBody::default()
    };

    let title = set_episodes(&host, SHOW, &body).unwrap();

    assert_eq!(title.seasons, [1]);
    assert!(units(&host, RequestKind::Show, SHOW).iter().all(|(s, _, _)| *s == Some(1)));
}

#[test]
fn switching_one_episode_on_monitors_just_that_episode() {
    let host = host();
    let _tmdb = tmdb();
    monitor(&host, RequestKind::Show, SHOW, &with_preset(MonitorPreset::None), None).unwrap();
    let body = EpisodeMonitoringBody {
        episodes: vec![EpisodeSwitch {
            episode: EpisodeRef {
                season: 2,
                episode: 1,
            },
            monitored: true,
        }],
        ..EpisodeMonitoringBody::default()
    };

    let title = set_episodes(&host, SHOW, &body).unwrap();

    assert_eq!(units(&host, RequestKind::Show, SHOW), [(Some(2), Some(1), wanted("wanted"))]);
    assert!(title.seasons.is_empty());
}

#[test]
fn switching_episodes_of_a_show_nobody_monitors_is_refused() {
    let host = host();

    assert!(set_episodes(&host, SHOW, &EpisodeMonitoringBody::default()).is_err());
}

#[test]
fn unmonitoring_forgets_the_title_and_its_rows() {
    let host = host();
    let _tmdb = tmdb();
    monitor(&host, RequestKind::Show, SHOW, &MonitorBody::default(), None).unwrap();

    let removed = unmonitor(&host, RequestKind::Show, SHOW).unwrap();

    assert!(removed);
    assert!(monitored(&host, RequestKind::Show, SHOW).is_none());
    assert!(units(&host, RequestKind::Show, SHOW).is_empty());
}

#[test]
fn many_titles_are_monitored_and_a_failure_is_reported_alone() {
    let host = host();
    let _tmdb = tmdb();
    let body = BulkMonitorBody {
        titles: vec![
            TitleRef {
                kind: RequestKind::Show,
                tmdb_id: SHOW,
            },
            TitleRef {
                kind: RequestKind::Show,
                tmdb_id: 404,
            },
        ],
        settings: MonitorBody::default(),
    };

    let summary = monitor_many(&host, &body, None);

    assert_eq!(summary.monitored, 1);
    assert_eq!(summary.failed.len(), 1);
    assert_eq!(summary.failed[0].0.tmdb_id, 404);
}

#[test]
fn a_whole_show_request_monitors_new_seasons_too() {
    let host = host();
    let _tmdb = tmdb();
    let req = crate::model::MediaRequest {
        id: "r1".into(),
        kind: RequestKind::Show,
        tmdb_id: SHOW,
        title: "Show".into(),
        year: None,
        poster_url: None,
        seasons: None,
        episodes: None,
        status: RequestStatus::Approved,
        requested_by: None,
        requested_by_name: None,
        reviewed_by: None,
        note: None,
        created_at: 0,
        updated_at: 0,
        progress: None,
        air_status: None,
        next_air_date: None,
        last_refresh_at: None,
    };
    let detail = title::fetch_detail(&host, RequestKind::Show, SHOW).unwrap();

    monitor_for_request(&host, &req, &detail).unwrap();
    monitor_for_request(
        &host,
        &crate::model::MediaRequest {
            seasons: Some(vec![2]),
            ..req
        },
        &detail,
    )
    .unwrap();

    let title = monitored(&host, RequestKind::Show, SHOW).unwrap();
    assert_eq!(title.seasons, [1, 2]);
    assert!(title.monitor_new_seasons);
}

#[test]
fn a_preview_aims_at_a_title_without_monitoring_it() {
    let host = host();
    let _tmdb = tmdb();

    let season = preview_rows(&host, RequestKind::Show, SHOW, Some(2)).unwrap();
    let movie = preview_rows(&host, RequestKind::Movie, MOVIE, None).unwrap();

    assert_eq!(season.len(), 2);
    assert!(season.iter().all(|r| r.season == Some(2)));
    assert_eq!(movie[0].air_date.as_deref(), Some("1999-09-21"));
    assert!(monitored(&host, RequestKind::Show, SHOW).is_none());
    assert!(units(&host, RequestKind::Show, SHOW).is_empty());
}
