//! What a request expands into: one [`SearchTarget`] per thing worth asking an
//! indexer for, and the coverage rule that says which wanted rows a grab of it
//! would satisfy.

use kroma_module_sdk::db::WantedRow;
use kroma_module_sdk::engine::model::RequestKind;
use crate::peers::indexers::Query;
use kroma_scene::Target;

/// One thing worth searching for: the Torznab query + the decision target +
/// what a grab of it would cover.
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

pub(super) fn movie_target(w: &WantedRow) -> SearchTarget {
    SearchTarget {
        query: Query::Movie {
            tmdb_id: Some(w.tmdb_id),
            imdb_id: w.imdb_id.clone(),
            title: w.title.clone(),
            year: w.year,
        },
        target: Target::Movie { year: w.year },
        kind: "movie",
        season: None,
        episodes: None,
    }
}

pub(super) fn episode_target(sample: &WantedRow, season: u32, episode: u32) -> SearchTarget {
    SearchTarget {
        query: Query::Episode {
            tmdb_id: Some(sample.tmdb_id),
            title: sample.title.clone(),
            season,
            episode,
        },
        target: Target::Episode { season, episode },
        kind: "episode",
        season: Some(season),
        episodes: Some(vec![episode]),
    }
}

// A pack covers the season as the ledger knows it, so its size budget is the
// season's FULL row count, not the still-open subset: a season with eight
// episodes already on disk and two open still downloads a ten-episode pack.
pub(super) fn season_target(sample: &WantedRow, season: u32, rows: &[&WantedRow]) -> SearchTarget {
    let covered: Vec<u32> = rows.iter().filter_map(|w| w.episode).collect();
    SearchTarget {
        query: Query::Season {
            tmdb_id: Some(sample.tmdb_id),
            title: sample.title.clone(),
            season,
        },
        target: Target::Season { season, episodes: rows.len() as u32 },
        kind: "season",
        season: Some(season),
        episodes: Some(covered),
    }
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
    let open_rows: Vec<&WantedRow> =
        open.iter().copied().filter(|w| w.season == Some(season)).collect();
    let aired_eps: Vec<u32> =
        open_rows.iter().copied().filter(|w| aired(w, today)).filter_map(|w| w.episode).collect();
    if aired_eps.is_empty() {
        return;
    }
    let has_future = open_rows.iter().any(|w| w.air_date.as_deref().is_some_and(|d| d > today));
    let all_rows = season_rows(wanted, season);
    let sample = open_rows[0];
    if !has_future {
        out.push(season_target(sample, season, &all_rows));
    }
    for ep in aired_eps {
        out.push(episode_target(sample, season, ep));
    }
}

/// The wanted rows a grab of this shape covers (flip to `grabbed`), keyed on
/// the target shape alone so callers holding a [`SearchTarget`] don't need a
/// full scored view to reach it.
pub fn wanted_ids_by(
    wanted: &[WantedRow],
    target: &str,
    season: Option<u32>,
    episodes: Option<&[u32]>,
) -> Vec<String> {
    match target {
        "movie" => wanted.iter().filter(|w| w.kind == "movie").map(|w| w.id.clone()).collect(),
        "season" => wanted.iter().filter(|w| w.season == season).map(|w| w.id.clone()).collect(),
        _ => wanted
            .iter()
            .filter(|w| {
                w.season == season
                    && w.episode.is_some_and(|e| episodes.is_some_and(|list| list.contains(&e)))
            })
            .map(|w| w.id.clone())
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(season: u32, episode: u32, air_date: Option<&str>) -> WantedRow {
        row(season, episode, air_date, "wanted")
    }

    fn row(season: u32, episode: u32, air_date: Option<&str>, status: &str) -> WantedRow {
        WantedRow {
            id: format!("s{season}e{episode}"),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "Show".into(),
            year: Some(2026),
            season: Some(season),
            episode: Some(episode),
            air_date: air_date.map(str::to_string),
            status: status.into(),
            last_search_at: None,
        }
    }

    fn movie_row(year: Option<u32>, air_date: Option<&str>) -> WantedRow {
        WantedRow {
            id: "m1".into(),
            request_id: "r1".into(),
            kind: "movie".into(),
            tmdb_id: 7,
            imdb_id: Some("tt1".into()),
            title: "Film".into(),
            year,
            season: None,
            episode: None,
            air_date: air_date.map(str::to_string),
            status: "wanted".into(),
            last_search_at: None,
        }
    }

    fn episode_numbers(targets: &[SearchTarget]) -> Vec<u32> {
        targets.iter().filter(|t| t.kind == "episode").filter_map(|t| t.episodes.as_ref()?.first()).copied().collect()
    }

    #[test]
    fn airing_season_searches_aired_episodes_per_episode_only() {
        let rows = vec![
            ep(1, 1, Some("2026-07-01")),
            ep(1, 2, Some("2026-07-08")),
            ep(1, 3, Some("2026-07-22")),
        ];
        let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
        assert_eq!(t.len(), 2, "two aired episodes, no pack, no future ep");
        assert!(t.iter().all(|x| x.kind == "episode"));
        assert_eq!(episode_numbers(&t), vec![1, 2]);
    }

    #[test]
    fn complete_season_searches_pack_first_then_episode_fallback() {
        let rows = vec![ep(2, 1, Some("2025-01-01")), ep(2, 2, Some("2025-01-08"))];
        let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
        assert_eq!(t.len(), 3);
        assert_eq!(t[0].kind, "season");
        assert!(t[1..].iter().all(|x| x.kind == "episode"));
    }

    #[test]
    fn no_air_date_is_treated_as_aired_complete() {
        let rows = vec![ep(1, 1, None), ep(1, 2, None)];
        let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
        assert_eq!(t[0].kind, "season");
        assert_eq!(t.len(), 3);
    }

    #[test]
    fn pack_budget_counts_the_whole_season_not_the_open_rows() {
        // Eight already on disk, two still wanted: a real ten-episode pack must
        // be budgeted for ten, or the scorer rejects every one as too-big.
        let mut rows: Vec<WantedRow> =
            (1..=8).map(|e| row(3, e, Some("2025-01-01"), "available")).collect();
        rows.push(ep(3, 9, Some("2025-01-01")));
        rows.push(ep(3, 10, Some("2025-01-08")));

        let t = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
        let pack = t.iter().find(|x| x.kind == "season").expect("a pack target");
        assert!(matches!(pack.target, Target::Season { season: 3, episodes: 10 }));
    }

    #[test]
    fn movie_target_built_for_aired_movie() {
        let rows = vec![movie_row(Some(2020), None)];
        let t = targets_for_wanted(RequestKind::Movie, &rows, "2026-07-16");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].kind, "movie");
        assert!(matches!(t[0].target, Target::Movie { year: Some(2020) }));
    }

    #[test]
    fn future_movie_is_not_searched() {
        let rows = vec![movie_row(Some(2030), Some("2030-01-01"))];
        let t = targets_for_wanted(RequestKind::Movie, &rows, "2026-07-16");
        assert!(t.is_empty());
    }

    #[test]
    fn wanted_ids_by_movie_season_episode() {
        let rows = vec![movie_row(None, None), ep(1, 1, None), ep(1, 2, None)];
        assert_eq!(wanted_ids_by(&rows, "movie", None, None), vec!["m1".to_string()]);
        assert_eq!(
            wanted_ids_by(&rows, "season", Some(1), None),
            vec!["s1e1".to_string(), "s1e2".to_string()]
        );
        assert_eq!(wanted_ids_by(&rows, "episode", Some(1), Some(&[2])), vec!["s1e2".to_string()]);
        assert!(wanted_ids_by(&rows, "episode", Some(1), Some(&[9])).is_empty());
    }
}
