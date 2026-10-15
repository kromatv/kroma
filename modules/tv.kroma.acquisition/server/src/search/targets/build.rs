//! What a request expands into: one [`SearchTarget`] per thing worth asking an
//! indexer for, and the coverage rule that says which wanted rows a grab of it
//! would satisfy.

use crate::peers::indexers::Query;
use kroma_module_sdk::db::WantedRow;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_scene::Target;

pub struct SearchTarget {
    pub query: Query,
    pub target: Target,
    pub kind: &'static str,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
}

// No air date is treated as aired (older ledgers, specials).
pub(super) fn aired(w: &WantedRow, today: &str) -> bool {
    w.air_date.as_deref().is_none_or(|d| d <= today)
}

impl SearchTarget {
    pub fn movie(tmdb_id: u64, imdb_id: Option<String>, title: String, year: Option<u32>) -> Self {
        SearchTarget {
            query: Query::Movie {
                tmdb_id: Some(tmdb_id),
                imdb_id,
                title,
                year,
            },
            target: Target::Movie { year },
            kind: "movie",
            season: None,
            episodes: None,
        }
    }

    pub fn episode(tmdb_id: u64, title: String, season: u32, episode: u32) -> Self {
        SearchTarget {
            query: Query::Episode {
                tmdb_id: Some(tmdb_id),
                title,
                season,
                episode,
            },
            target: Target::Episode { season, episode },
            kind: "episode",
            season: Some(season),
            episodes: Some(vec![episode]),
        }
    }

    /// A pack of one season, its size budgeted for `length` episodes. `covered`
    /// is what a grab of it satisfies, `None` when nothing is tracked.
    pub fn season(
        tmdb_id: u64,
        title: String,
        season: u32,
        length: u32,
        covered: Option<Vec<u32>>,
    ) -> Self {
        SearchTarget {
            query: Query::Season {
                tmdb_id: Some(tmdb_id),
                title,
                season,
            },
            target: Target::Season {
                season,
                episodes: length,
            },
            kind: "season",
            season: Some(season),
            episodes: covered,
        }
    }
}

pub(super) fn movie_target(w: &WantedRow) -> SearchTarget {
    SearchTarget::movie(w.tmdb_id, w.imdb_id.clone(), w.title.clone(), w.year)
}

pub(super) fn episode_target(sample: &WantedRow, season: u32, episode: u32) -> SearchTarget {
    SearchTarget::episode(sample.tmdb_id, sample.title.clone(), season, episode)
}

// A pack covers the season as the ledger knows it, so its size budget is the
// season's FULL row count, not the still-open subset: a season with eight
// episodes already on disk and two open still downloads a ten-episode pack.
pub(super) fn season_target(sample: &WantedRow, season: u32, rows: &[&WantedRow]) -> SearchTarget {
    let covered = rows.iter().filter_map(|w| w.episode).collect();
    let (tmdb_id, title) = (sample.tmdb_id, sample.title.clone());
    SearchTarget::season(tmdb_id, title, season, rows.len() as u32, Some(covered))
}

pub(super) fn season_rows(wanted: &[WantedRow], season: u32) -> Vec<&WantedRow> {
    wanted.iter().filter(|w| w.season == Some(season)).collect()
}

/// Build the search targets for a whole request. An AIRING season (an episode
/// still to come) searches only the aired-but-open episodes individually, since
/// no season pack exists mid-airing. A COMPLETE season searches the pack first,
/// then the aired episodes as a fallback for when there's no pack. Unaired
/// episodes are never searched.
pub fn targets_for_wanted(
    kind: RequestKind,
    wanted: &[WantedRow],
    today: &str,
) -> Vec<SearchTarget> {
    let open: Vec<&WantedRow> = wanted.iter().filter(|w| w.status == "wanted").collect();
    let mut out: Vec<SearchTarget> = Vec::new();
    match kind {
        RequestKind::Movie => {
            if let Some(w) = open.iter().copied().find(|w| aired(w, today)) {
                out.push(movie_target(w));
            }
        }
        RequestKind::Show => {
            let mut seasons: Vec<u32> = open.iter().filter_map(|w| w.season).collect();
            seasons.sort_unstable();
            seasons.dedup();
            for season in seasons {
                push_season_targets(&mut out, wanted, &open, season, today);
            }
        }
    }
    out
}

fn push_season_targets(
    out: &mut Vec<SearchTarget>,
    wanted: &[WantedRow],
    open: &[&WantedRow],
    season: u32,
    today: &str,
) {
    let open_rows: Vec<&WantedRow> = open
        .iter()
        .copied()
        .filter(|w| w.season == Some(season))
        .collect();
    let aired_eps: Vec<u32> = open_rows
        .iter()
        .copied()
        .filter(|w| aired(w, today))
        .filter_map(|w| w.episode)
        .collect();
    if aired_eps.is_empty() {
        return;
    }
    let has_future = open_rows
        .iter()
        .any(|w| w.air_date.as_deref().is_some_and(|d| d > today));
    let all_rows = season_rows(wanted, season);
    let sample = open_rows[0];
    if !has_future {
        out.push(season_target(sample, season, &all_rows));
    }
    for ep in aired_eps {
        out.push(episode_target(sample, season, ep));
    }
}

/// The wanted rows a grab of this shape covers (flip to `grabbed`).
pub fn wanted_ids_by(
    wanted: &[WantedRow],
    target: &str,
    season: Option<u32>,
    episodes: Option<&[u32]>,
) -> Vec<String> {
    match target {
        "movie" => wanted
            .iter()
            .filter(|w| w.kind == "movie")
            .map(|w| w.id.clone())
            .collect(),
        "season" => wanted
            .iter()
            .filter(|w| w.season == season)
            .map(|w| w.id.clone())
            .collect(),
        _ => wanted
            .iter()
            .filter(|w| {
                w.season == season
                    && w.episode
                        .is_some_and(|e| episodes.is_some_and(|list| list.contains(&e)))
            })
            .map(|w| w.id.clone())
            .collect(),
    }
}

#[cfg(test)]
mod tests;
