use std::collections::BTreeMap;

use kroma_module_sdk::db::WantedRow;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_scene::QualityProfile;

use crate::rules::files::{JudgedFile, unit_below_target};
use crate::search::SearchTarget;

/// What to search to upgrade a title: the film, or per season the pack when
/// every monitored episode there could be improved, else the episodes that
/// could. Each target comes with the rows it covers.
pub(crate) fn upgrade_targets(
    kind: RequestKind,
    rows: &[WantedRow],
    files: &[JudgedFile],
    profile: &QualityProfile,
) -> Vec<(SearchTarget, Vec<String>)> {
    let unmet = |season, episode| unit_below_target(files, season, episode, profile);
    if kind == RequestKind::Movie {
        return rows
            .iter()
            .find(|w| w.kind == "movie" && unmet(None, None))
            .map(|w| {
                let st = SearchTarget::movie(w.tmdb_id, w.imdb_id.clone(), w.title.clone(), w.year);
                (st, vec![w.id.clone()])
            })
            .into_iter()
            .collect();
    }
    let mut seasons: BTreeMap<u32, Vec<&WantedRow>> = BTreeMap::new();
    for w in rows {
        if let Some(season) = w.season {
            seasons.entry(season).or_default().push(w);
        }
    }
    let mut out = Vec::new();
    for (season, held) in seasons {
        let open: Vec<&&WantedRow> = held.iter().filter(|w| unmet(w.season, w.episode)).collect();
        if open.is_empty() {
            continue;
        }
        let sample = held[0];
        if open.len() == held.len() && held.len() > 1 {
            let episodes: Vec<u32> = held.iter().filter_map(|w| w.episode).collect();
            let st = SearchTarget::season(
                sample.tmdb_id,
                sample.title.clone(),
                season,
                held.len() as u32,
                Some(episodes),
            );
            out.push((st, held.iter().map(|w| w.id.clone()).collect()));
            continue;
        }
        for w in open {
            if let Some(episode) = w.episode {
                let st = SearchTarget::episode(w.tmdb_id, w.title.clone(), season, episode);
                out.push((st, vec![w.id.clone()]));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::TestRules;
    use kroma_scene::{Evaluation, Quality};

    fn row(id: &str, season: Option<u32>, episode: Option<u32>) -> WantedRow {
        WantedRow {
            id: id.into(),
            request_id: None,
            kind: if season.is_some() { "episode" } else { "movie" }.into(),
            tmdb_id: 7,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season,
            episode,
            air_date: None,
            status: "available".into(),
            last_search_at: None,
        }
    }

    fn file(season: Option<u32>, episode: Option<u32>, quality: Quality, rank: u32) -> JudgedFile {
        JudgedFile {
            file_id: format!("f{season:?}{episode:?}"),
            rel_path: None,
            season,
            episode,
            episode_end: None,
            release: None,
            runtime_minutes: None,
            evaluation: Evaluation {
                quality,
                quality_rank: Some(rank),
                formats: Vec::new(),
                format_score: 0,
                revision: 1,
            },
            below_target: false,
        }
    }

    fn cutoff_rank(rules: &TestRules) -> u32 {
        rules.profile.cutoff_rank()
    }

    #[test]
    fn a_film_below_its_cutoff_is_searched() {
        let rules = TestRules::new();
        let rows = [row("m", None, None)];
        let files = [file(None, None, Quality::WebDl720, 1)];

        let targets = upgrade_targets(RequestKind::Movie, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "movie");
        assert_eq!(targets[0].1, ["m"]);
    }

    #[test]
    fn a_film_at_its_cutoff_is_left_alone() {
        let rules = TestRules::new();
        let rows = [row("m", None, None)];
        let files = [file(None, None, Quality::Bluray1080, cutoff_rank(&rules))];

        assert!(upgrade_targets(RequestKind::Movie, &rows, &files, &rules.profile).is_empty());
    }

    #[test]
    fn a_season_whose_every_episode_is_below_takes_a_pack() {
        let rules = TestRules::new();
        let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2))];
        let files = [
            file(Some(1), Some(1), Quality::WebDl720, 1),
            file(Some(1), Some(2), Quality::WebDl720, 1),
        ];

        let targets = upgrade_targets(RequestKind::Show, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "season");
        assert_eq!(targets[0].1, ["a", "b"]);
    }

    #[test]
    fn a_season_partly_below_takes_the_episodes_that_are() {
        let rules = TestRules::new();
        let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2))];
        let files = [
            file(Some(1), Some(1), Quality::WebDl720, 1),
            file(Some(1), Some(2), Quality::Bluray1080, cutoff_rank(&rules)),
        ];

        let targets = upgrade_targets(RequestKind::Show, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "episode");
        assert_eq!(targets[0].1, ["a"]);
    }
}
