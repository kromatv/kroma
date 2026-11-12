use std::collections::HashSet;

use crate::model::MonitorPreset;
use crate::lifecycle::shift_ymd;

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
mod tests;
