use super::*;

const TODAY: &str = "2026-06-01";

fn ep(season: u32, episode: u32, air: &str) -> RosterEpisode {
    RosterEpisode {
        season,
        episode,
        air_date: Some(air.into()),
    }
}

fn roster() -> Vec<RosterEpisode> {
    vec![
        ep(1, 1, "2024-01-01"),
        ep(1, 2, "2024-01-08"),
        ep(2, 1, "2026-05-01"),
        ep(2, 2, "2026-07-01"),
    ]
}

fn disk() -> HashSet<(u32, u32)> {
    [(1, 1), (2, 1)].into_iter().collect()
}

fn only(preset: MonitorPreset) -> Choice {
    Choice {
        preset,
        specials: false,
    }
}

fn episodes(preset: MonitorPreset) -> Vec<(u32, u32)> {
    select(only(preset), &roster(), &disk(), TODAY).episodes
}

#[test]
fn all_monitors_every_episode_and_new_seasons() {
    let s = select(only(MonitorPreset::All), &roster(), &disk(), TODAY);

    assert_eq!(s.episodes.len(), 4);
    assert_eq!(s.seasons, [1, 2]);
    assert!(s.monitor_new_seasons);
}

#[test]
fn future_monitors_what_has_not_aired() {
    assert_eq!(episodes(MonitorPreset::Future), [(2, 2)]);
}

#[test]
fn missing_monitors_what_is_not_on_disk_and_what_is_to_come() {
    assert_eq!(episodes(MonitorPreset::Missing), [(1, 2), (2, 2)]);
}

#[test]
fn existing_monitors_only_what_is_on_disk_and_takes_no_new_episode() {
    let s = select(only(MonitorPreset::Existing), &roster(), &disk(), TODAY);

    assert_eq!(s.episodes, [(1, 1), (2, 1)]);
    assert!(s.seasons.is_empty());
    assert!(!s.monitor_new_seasons);
}

#[test]
fn first_and_latest_season_monitor_one_season() {
    assert_eq!(episodes(MonitorPreset::FirstSeason), [(1, 1), (1, 2)]);
    assert_eq!(episodes(MonitorPreset::LatestSeason), [(2, 1), (2, 2)]);
}

#[test]
fn pilot_monitors_the_first_episode() {
    assert_eq!(episodes(MonitorPreset::Pilot), [(1, 1)]);
}

#[test]
fn none_monitors_nothing() {
    let s = select(only(MonitorPreset::None), &roster(), &disk(), TODAY);

    assert!(s.episodes.is_empty());
    assert!(s.seasons.is_empty());
}

#[test]
fn recent_monitors_the_last_three_months_and_what_is_to_come() {
    let roster = vec![
        ep(1, 1, "2024-01-01"),
        ep(1, 2, "2026-02-01"),
        ep(2, 1, "2026-05-01"),
        ep(2, 2, "2026-07-01"),
    ];

    let s = select(only(MonitorPreset::Recent), &roster, &disk(), TODAY);

    assert_eq!(s.episodes, [(2, 1), (2, 2)]);
    assert!(s.monitor_new_seasons);
}

#[test]
fn a_preset_leaves_the_specials_alone_unless_they_are_asked_for() {
    let roster = vec![ep(0, 1, "2024-06-01"), ep(1, 1, "2024-01-01")];
    let with_specials = Choice {
        preset: MonitorPreset::All,
        specials: true,
    };

    let without = select(only(MonitorPreset::All), &roster, &disk(), TODAY);
    let with = select(with_specials, &roster, &disk(), TODAY);

    assert_eq!(without.episodes, [(1, 1)]);
    assert_eq!(without.seasons, [1]);
    assert_eq!(with.episodes, [(0, 1), (1, 1)]);
    assert_eq!(with.seasons, [0, 1]);
}

#[test]
fn the_specials_season_is_only_read_when_it_is_asked_for() {
    let seasons = [0, 1, 2];

    assert_eq!(
        seasons_to_read(only(MonitorPreset::All), &seasons, &disk()),
        [1, 2]
    );
    assert_eq!(
        seasons_to_read(
            Choice {
                preset: MonitorPreset::All,
                specials: true
            },
            &seasons,
            &disk()
        ),
        [0, 1, 2]
    );
}

#[test]
fn an_undated_episode_counts_as_still_to_come() {
    let undated = vec![RosterEpisode {
        season: 3,
        episode: 1,
        air_date: None,
    }];

    let s = select(
        only(MonitorPreset::Future),
        &undated,
        &HashSet::new(),
        TODAY,
    );

    assert_eq!(s.episodes, [(3, 1)]);
}

#[test]
fn a_preset_reads_only_the_seasons_it_looks_at() {
    let seasons = [1, 2, 3];

    assert_eq!(
        seasons_to_read(only(MonitorPreset::Pilot), &seasons, &disk()),
        [1]
    );
    assert_eq!(
        seasons_to_read(only(MonitorPreset::LatestSeason), &seasons, &disk()),
        [3]
    );
    assert_eq!(
        seasons_to_read(only(MonitorPreset::Existing), &seasons, &disk()),
        [1, 2]
    );
    assert_eq!(
        seasons_to_read(only(MonitorPreset::All), &seasons, &disk()),
        [1, 2, 3]
    );
    assert!(seasons_to_read(only(MonitorPreset::None), &seasons, &disk()).is_empty());
}
