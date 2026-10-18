use std::collections::HashSet;

use crate::model::MonitorPreset;
use crate::services::requests::shift_ymd;

const RECENT_DAYS: i64 = 90;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Choice {
    pub(crate) preset: MonitorPreset,
    pub(crate) specials: bool,
}

impl Choice {
    fn takes(self, season: u32) -> bool {
        self.specials || season != 0
    }
}

/// One episode of a show's TMDB roster.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RosterEpisode {
    pub(crate) season: u32,
    pub(crate) episode: u32,
    pub(crate) air_date: Option<String>,
}

/// What applying a preset monitors: the episodes, the seasons whose new
/// episodes join later, and whether a new season joins on its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Selection {
    pub(crate) episodes: Vec<(u32, u32)>,
    pub(crate) seasons: Vec<u32>,
    pub(crate) monitor_new_seasons: bool,
}

/// The seasons a preset needs the episode list of, out of `seasons`, so a
/// preset that looks at one season fetches one.
pub(crate) fn seasons_to_read(
    choice: Choice,
    seasons: &[u32],
    on_disk: &HashSet<(u32, u32)>,
) -> Vec<u32> {
    let seasons: Vec<u32> = seasons
        .iter()
        .copied()
        .filter(|&s| choice.takes(s))
        .collect();
    match choice.preset {
        MonitorPreset::None => Vec::new(),
        MonitorPreset::Pilot | MonitorPreset::FirstSeason => {
            seasons.into_iter().filter(|&s| s == 1).collect()
        }
        MonitorPreset::LatestSeason => seasons.into_iter().max().into_iter().collect(),
        MonitorPreset::Existing => seasons
            .into_iter()
            .filter(|s| on_disk.iter().any(|(season, _)| season == s))
            .collect(),
        MonitorPreset::All
        | MonitorPreset::Future
        | MonitorPreset::Missing
        | MonitorPreset::Recent => seasons,
    }
}

/// Which episodes of `roster` a preset monitors, `today` being `YYYY-MM-DD`.
pub(crate) fn select(
    choice: Choice,
    roster: &[RosterEpisode],
    on_disk: &HashSet<(u32, u32)>,
    today: &str,
) -> Selection {
    let listed: Vec<&RosterEpisode> = roster.iter().filter(|e| choice.takes(e.season)).collect();
    let all_seasons = distinct_seasons(&listed);
    let latest = all_seasons.last().copied();
    let since = shift_ymd(today, -RECENT_DAYS);
    let keep = |e: &RosterEpisode| {
        let unaired = e.air_date.as_deref().is_none_or(|d| d > today);
        let recent = e
            .air_date
            .as_deref()
            .zip(since.as_deref())
            .is_some_and(|(aired, from)| aired >= from);
        match choice.preset {
            MonitorPreset::All => true,
            MonitorPreset::Future => unaired,
            MonitorPreset::Missing => unaired || !on_disk.contains(&(e.season, e.episode)),
            MonitorPreset::Recent => unaired || recent,
            MonitorPreset::Existing => on_disk.contains(&(e.season, e.episode)),
            MonitorPreset::FirstSeason => e.season == 1,
            MonitorPreset::LatestSeason => Some(e.season) == latest,
            MonitorPreset::Pilot => (e.season, e.episode) == (1, 1),
            MonitorPreset::None => false,
        }
    };
    let (seasons, monitor_new_seasons) = match choice.preset {
        MonitorPreset::All
        | MonitorPreset::Future
        | MonitorPreset::Missing
        | MonitorPreset::Recent => (all_seasons.clone(), true),
        MonitorPreset::FirstSeason => (vec![1], false),
        MonitorPreset::LatestSeason => (latest.into_iter().collect(), false),
        MonitorPreset::Existing | MonitorPreset::Pilot | MonitorPreset::None => (Vec::new(), false),
    };
    Selection {
        episodes: listed
            .iter()
            .filter(|e| keep(e))
            .map(|e| (e.season, e.episode))
            .collect(),
        seasons,
        monitor_new_seasons,
    }
}

fn distinct_seasons(roster: &[&RosterEpisode]) -> Vec<u32> {
    let mut seasons: Vec<u32> = roster.iter().map(|e| e.season).collect();
    seasons.sort_unstable();
    seasons.dedup();
    seasons
}

#[cfg(test)]
mod tests {
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
}
