use super::*;

fn later_tmdb(seasons: &[u32]) -> FakeTmdb {
    let seasons: Vec<serde_json::Value> = seasons
        .iter()
        .map(|n| json!({ "season_number": n }))
        .collect();
    FakeTmdb::start(move |path| match path {
        "/tv/77" => (
            200,
            json!({ "name": "Show", "status": "Returning Series", "seasons": seasons }),
        ),
        "/tv/77/season/1" => (
            200,
            json!({ "episodes": [episode(1, "2020-01-01"), episode(2, "2020-01-08"), episode(3, "2020-01-15")] }),
        ),
        "/tv/77/season/2" => (
            200,
            json!({ "episodes": [episode(1, "2021-01-01"), episode(2, "2999-01-01")] }),
        ),
        "/tv/77/season/3" => (200, json!({ "episodes": [episode(1, "2022-01-01")] })),
        _ => (404, json!({})),
    })
}

fn age(host: &StubHost) {
    exec(host, "UPDATE monitored SET refreshed_at = 0");
}

#[test]
fn an_episode_announced_since_joins_and_wakes_the_search() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Show,
            SHOW,
            &MonitorBody::default(),
            None,
        )
        .unwrap();
    }
    age(&host);
    let _later = later_tmdb(&[1, 2]);

    let refreshed = refresh_pass(&host).unwrap();

    assert_eq!(refreshed, 1);
    assert!(held(&host).contains(&(Some(1), Some(3))));
    assert!(
        host.jobs()
            .iter()
            .any(|(key, _)| *key == "acquisition.search")
    );
}

#[test]
fn an_episode_switched_off_stays_off() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Show,
            SHOW,
            &MonitorBody::default(),
            None,
        )
        .unwrap();
        let off = EpisodeMonitoringBody {
            episodes: vec![EpisodeSwitch {
                episode: EpisodeRef {
                    season: 1,
                    episode: 2,
                },
                monitored: false,
            }],
            ..EpisodeMonitoringBody::default()
        };
        set_episodes(&host, SHOW, &off).unwrap();
    }
    age(&host);
    let _later = later_tmdb(&[1, 2]);

    refresh_pass(&host).unwrap();

    assert!(!held(&host).contains(&(Some(1), Some(2))));
}

#[test]
fn a_new_season_joins_a_show_that_takes_new_seasons() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Show,
            SHOW,
            &MonitorBody::default(),
            None,
        )
        .unwrap();
    }
    age(&host);
    let _later = later_tmdb(&[1, 2, 3]);

    refresh_pass(&host).unwrap();

    assert!(held(&host).contains(&(Some(3), Some(1))));
    assert_eq!(
        monitored(&host, RequestKind::Show, SHOW).unwrap().seasons,
        [1, 2, 3]
    );
}

#[test]
fn a_new_season_stays_out_of_a_show_that_does_not() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Show,
            SHOW,
            &with_preset(MonitorPreset::FirstSeason),
            None,
        )
        .unwrap();
    }
    age(&host);
    let _later = later_tmdb(&[1, 2, 3]);

    refresh_pass(&host).unwrap();

    assert!(held(&host).iter().all(|(s, _)| *s == Some(1)));
}

#[test]
fn a_film_whose_home_release_appears_is_searched_from_it() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Movie,
            CINEMA_MOVIE,
            &MonitorBody::default(),
            None,
        )
        .unwrap();
    }
    age(&host);
    let _later = FakeTmdb::start(|path| match path {
        "/movie/604" => (200, in_cinemas(Some("2026-04-10"))),
        _ => (404, json!({})),
    });

    refresh_pass(&host).unwrap();

    assert_eq!(air_date(&host, CINEMA_MOVIE).as_deref(), Some("2026-04-10"));
}

#[test]
fn a_title_refreshed_recently_is_left_alone() {
    let host = host();
    let _tmdb = tmdb();
    monitor(
        &host,
        RequestKind::Show,
        SHOW,
        &MonitorBody::default(),
        None,
    )
    .unwrap();

    assert_eq!(refresh_pass(&host).unwrap(), 0);
}

#[test]
fn an_ended_show_is_not_read_again() {
    let host = host();
    {
        let _tmdb = tmdb();
        monitor(
            &host,
            RequestKind::Show,
            SHOW,
            &MonitorBody::default(),
            None,
        )
        .unwrap();
    }
    exec(
        &host,
        "UPDATE monitored SET refreshed_at = 0, air_status = 'Ended'",
    );

    assert_eq!(refresh_pass(&host).unwrap(), 0);
}
