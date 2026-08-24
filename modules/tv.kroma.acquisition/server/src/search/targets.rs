//! What a search is aimed at: the scope the caller asked for, and the targets
//! it selects out of the request (see the `build` submodule for the targets
//! themselves).

use kroma_module_sdk::db::WantedRow;
use kroma_module_sdk::engine::model::RequestKind;
use serde::{Deserialize, Serialize};

mod build;

use build::{aired, episode_target, movie_target, season_rows, season_target};
pub use build::{targets_for_wanted, wanted_ids_by, SearchTarget};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SearchScope {
    #[default]
    All,
    Movie,
    #[serde(rename_all = "camelCase")]
    Season {
        season: u32,
    },
    #[serde(rename_all = "camelCase")]
    Episode {
        season: u32,
        episode: u32,
    },
}

impl SearchScope {
    /// Whether this scope is one the request's kind can actually be searched
    /// under. `All` fits both; the rest name a movie or a show and nothing else.
    pub fn fits(&self, kind: RequestKind) -> bool {
        match self {
            SearchScope::All => true,
            SearchScope::Movie => kind == RequestKind::Movie,
            SearchScope::Season { .. } | SearchScope::Episode { .. } => kind == RequestKind::Show,
        }
    }

    /// The season this scope names, if it names one.
    pub fn season(&self) -> Option<u32> {
        match self {
            SearchScope::Season { season } | SearchScope::Episode { season, .. } => Some(*season),
            SearchScope::All | SearchScope::Movie => None,
        }
    }

    /// Stable key for the per-request result cache.
    pub fn cache_key(&self) -> String {
        match self {
            SearchScope::All => "all".into(),
            SearchScope::Movie => "movie".into(),
            SearchScope::Season { season } => format!("s{season}"),
            SearchScope::Episode { season, episode } => format!("s{season}e{episode}"),
        }
    }
}

/// The targets for a request, narrowed to what the caller asked for. `today`
/// gates unaired episodes out of every scope: they are on no indexer, whoever
/// asked.
pub fn targets_for_scope(
    kind: RequestKind,
    wanted: &[WantedRow],
    today: &str,
    scope: SearchScope,
) -> Vec<SearchTarget> {
    // A scope that does not belong to the request's kind searches nothing: a
    // `movie` scope on a show would otherwise take an episode row as its sample
    // and file the result into the movie library with an empty ledger.
    if !scope.fits(kind) {
        return Vec::new();
    }
    match scope {
        SearchScope::All => targets_for_wanted(kind, wanted, today),
        SearchScope::Movie => wanted
            .iter()
            .find(|w| w.kind == "movie")
            .map(movie_target)
            .into_iter()
            .collect(),
        SearchScope::Season { season } => {
            let rows = season_rows(wanted, season);
            let Some(sample) = rows.first().copied() else {
                return Vec::new();
            };
            // The scope is the admin's call, the air dates are not: an unaired
            // episode is on no indexer, and no pack exists mid-airing. Without
            // this a 24-episode season narrows into 25 serial round trips, more
            // than the whole-request sweep it was meant to be cheaper than.
            let has_future = rows
                .iter()
                .any(|w| w.air_date.as_deref().is_some_and(|d| d > today));
            let mut out = Vec::new();
            if !has_future {
                out.push(season_target(sample, season, &rows));
            }
            out.extend(
                rows.iter()
                    .copied()
                    .filter(|w| aired(w, today))
                    .filter_map(|w| w.episode)
                    .map(|e| episode_target(sample, season, e)),
            );
            out
        }
        SearchScope::Episode { season, episode } => wanted
            .iter()
            .find(|w| w.season == Some(season))
            .map(|sample| vec![episode_target(sample, season, episode)])
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_scene::Target;

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
        targets
            .iter()
            .filter(|t| t.kind == "episode")
            .filter_map(|t| t.episodes.as_ref()?.first())
            .copied()
            .collect()
    }

    #[test]
    fn movie_scope_ignores_the_air_date_gate() {
        let rows = vec![movie_row(Some(2030), Some("2030-01-01"))];
        let t = targets_for_scope(RequestKind::Movie, &rows, "2026-07-16", SearchScope::Movie);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].kind, "movie");
    }

    #[test]
    fn a_season_still_airing_scopes_to_its_aired_episodes() {
        // No pack exists mid-airing and an unaired episode is on no indexer, so
        // neither is worth a round trip. Without this a 24-episode season
        // narrowed into 25 serial sweeps, more than the whole request costs.
        let rows = vec![
            ep(1, 1, Some("2026-07-01")),
            ep(1, 2, Some("2026-07-22")),
            ep(2, 1, Some("2026-08-01")),
        ];
        let t = targets_for_scope(
            RequestKind::Show,
            &rows,
            "2026-07-16",
            SearchScope::Season { season: 1 },
        );
        assert_eq!(t.len(), 1);
        assert_eq!(episode_numbers(&t), vec![1]);
    }

    #[test]
    fn a_finished_season_scopes_to_the_pack_then_every_episode() {
        let rows = vec![ep(1, 1, Some("2026-07-01")), ep(1, 2, Some("2026-07-08"))];
        let t = targets_for_scope(
            RequestKind::Show,
            &rows,
            "2026-07-16",
            SearchScope::Season { season: 1 },
        );
        assert_eq!(t.len(), 3);
        assert_eq!(t[0].kind, "season");
        assert!(matches!(
            t[0].target,
            Target::Season {
                season: 1,
                episodes: 2
            }
        ));
        assert_eq!(episode_numbers(&t), vec![1, 2]);
    }

    #[test]
    fn a_scope_the_request_kind_cannot_take_searches_nothing() {
        // `?scope=movie` on a show used to take an episode row as its sample and
        // file the result into the movie library with an empty ledger.
        let rows = vec![ep(1, 1, None)];
        assert!(
            targets_for_scope(RequestKind::Show, &rows, "2026-07-16", SearchScope::Movie)
                .is_empty()
        );

        let movie = vec![movie_row(Some(2020), Some("2020-01-01"))];
        assert!(targets_for_scope(
            RequestKind::Movie,
            &movie,
            "2026-07-16",
            SearchScope::Season { season: 1 }
        )
        .is_empty());
    }

    #[test]
    fn season_scope_of_an_unknown_season_is_empty() {
        let rows = vec![ep(1, 1, None)];
        let t = targets_for_scope(
            RequestKind::Show,
            &rows,
            "2026-07-16",
            SearchScope::Season { season: 9 },
        );
        assert!(t.is_empty());
    }

    #[test]
    fn episode_scope_is_exactly_one_target() {
        let rows = vec![ep(1, 1, None), ep(1, 2, None), ep(1, 3, None)];
        let t = targets_for_scope(
            RequestKind::Show,
            &rows,
            "2026-07-16",
            SearchScope::Episode {
                season: 1,
                episode: 2,
            },
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].kind, "episode");
        assert!(matches!(
            t[0].target,
            Target::Episode {
                season: 1,
                episode: 2
            }
        ));
    }

    #[test]
    fn all_scope_is_the_whole_request() {
        let rows = vec![ep(1, 1, None), ep(1, 2, None)];
        let scoped = targets_for_scope(RequestKind::Show, &rows, "2026-07-16", SearchScope::All);
        let whole = targets_for_wanted(RequestKind::Show, &rows, "2026-07-16");
        assert_eq!(scoped.len(), whole.len());
    }

    #[test]
    fn scope_cache_keys_are_distinct() {
        let keys = [
            SearchScope::All.cache_key(),
            SearchScope::Movie.cache_key(),
            SearchScope::Season { season: 1 }.cache_key(),
            SearchScope::Episode {
                season: 1,
                episode: 1,
            }
            .cache_key(),
        ];
        let unique: std::collections::HashSet<&String> = keys.iter().collect();
        assert_eq!(unique.len(), keys.len());
    }

    #[test]
    fn scope_round_trips_through_json() {
        for scope in [
            SearchScope::All,
            SearchScope::Movie,
            SearchScope::Season { season: 3 },
            SearchScope::Episode {
                season: 3,
                episode: 7,
            },
        ] {
            let raw = serde_json::to_string(&scope).unwrap();
            assert_eq!(
                serde_json::from_str::<SearchScope>(&raw).unwrap(),
                scope,
                "{raw}"
            );
        }
    }
}
