//! What grabbing a release would do to the files a title already holds.

use kroma_scene::{Evaluation, QualityProfile, Verdict, upgrade_verdict};

use crate::dtos::ScoredReleaseView;
use crate::rules::files::JudgedFile;

/// The units a release covers, as `(season, episode)`: `(None, None)` for a
/// film, one per episode otherwise.
pub fn units_of(view: &ScoredReleaseView, files: &[JudgedFile]) -> Vec<(Option<u32>, Option<u32>)> {
    match (view.target.as_str(), view.season) {
        ("movie", _) => vec![(None, None)],
        (_, Some(season)) => match &view.episodes {
            Some(episodes) => episodes.iter().map(|e| (Some(season), Some(*e))).collect(),
            None => {
                let mut held: Vec<(Option<u32>, Option<u32>)> = files
                    .iter()
                    .filter(|f| f.season == Some(season))
                    .map(|f| (f.season, f.episode))
                    .collect();
                held.dedup();
                held
            }
        },
        _ => Vec::new(),
    }
}

/// What grabbing `candidate` does to the files of every unit it covers: a
/// fill when any unit is empty, else the first unit it would not improve, else
/// an upgrade (beside the files when any unit takes it that way).
pub fn verdict_for(
    candidate: &Evaluation,
    units: &[(Option<u32>, Option<u32>)],
    files: &[JudgedFile],
    profile: &QualityProfile,
) -> Verdict {
    let verdicts: Vec<Verdict> = units
        .iter()
        .map(|&(season, episode)| {
            let held: Vec<Evaluation> = files
                .iter()
                .filter(|f| f.holds(season, episode))
                .map(|f| f.evaluation.clone())
                .collect();
            upgrade_verdict(candidate, &held, profile)
        })
        .collect();
    if verdicts.is_empty() || verdicts.contains(&Verdict::Fill) {
        return Verdict::Fill;
    }
    if let Some(refused) = verdicts.iter().find(|v| !v.is_wanted()) {
        return *refused;
    }
    verdicts
        .iter()
        .find(|v| matches!(v, Verdict::Beside(_)))
        .copied()
        .unwrap_or(verdicts[0])
}

#[cfg(test)]
mod tests {
    use kroma_scene::Quality;

    use super::*;
    use crate::search::targets::SearchTarget;
    use crate::search::test_support::{episode_target, indexer, release, TestRules};

    fn view_for(target: &SearchTarget, name: &str) -> ScoredReleaseView {
        let rules = TestRules::new();
        rules.judge().release(&release(name, Some(10)), &indexer(1), target).0
    }

    fn held(season: u32, episode: u32, quality: Quality, rank: u32) -> JudgedFile {
        JudgedFile {
            file_id: format!("f{season}{episode}"),
            rel_path: None,
            season: Some(season),
            episode: Some(episode),
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

    fn candidate(rules: &TestRules) -> Evaluation {
        Evaluation {
            quality: Quality::Bluray1080,
            quality_rank: Some(rules.profile.cutoff_rank()),
            formats: Vec::new(),
            format_score: 0,
            revision: 1,
        }
    }

    #[test]
    fn a_film_covers_the_one_unit_a_film_is() {
        let target = SearchTarget::movie(1, None, "Dune".into(), Some(2021));
        let view = view_for(&target, "Dune.2021.1080p.BluRay.x264-GRP");

        assert_eq!(units_of(&view, &[]), [(None, None)]);
    }

    #[test]
    fn an_episode_release_covers_the_episodes_it_names() {
        let view = view_for(&episode_target(), "Show.S01E01.1080p.BluRay.x264-GRP");

        assert_eq!(units_of(&view, &[]), [(Some(1), Some(1))]);
    }

    #[test]
    fn a_pack_without_an_episode_list_covers_the_episodes_held_in_its_season() {
        let target = SearchTarget::season(42, "Show".into(), 1, 2, None);
        let view = view_for(&target, "Show.S01.1080p.BluRay.x264-GRP");
        let files = [
            held(1, 1, Quality::WebDl720, 1),
            held(1, 2, Quality::WebDl720, 1),
            held(2, 1, Quality::WebDl720, 1),
        ];

        assert_eq!(units_of(&view, &files), [(Some(1), Some(1)), (Some(1), Some(2))]);
    }

    #[test]
    fn a_release_that_covers_nothing_is_a_fill() {
        let rules = TestRules::new();

        let verdict = verdict_for(&candidate(&rules), &[], &[], &rules.profile);

        assert_eq!(verdict, Verdict::Fill);
    }

    #[test]
    fn a_unit_with_no_file_is_a_fill() {
        let rules = TestRules::new();

        let verdict = verdict_for(&candidate(&rules), &[(Some(1), Some(1))], &[], &rules.profile);

        assert_eq!(verdict, Verdict::Fill);
    }

    #[test]
    fn a_unit_held_below_the_candidate_is_an_upgrade() {
        let rules = TestRules::new();
        let files = [held(1, 1, Quality::WebDl720, 1)];

        let verdict = verdict_for(&candidate(&rules), &[(Some(1), Some(1))], &files, &rules.profile);

        assert!(matches!(verdict, Verdict::Upgrade(_)), "{verdict:?}");
    }

    #[test]
    fn a_unit_already_held_at_the_cutoff_refuses_the_candidate() {
        let rules = TestRules::new();
        let files = [held(1, 1, Quality::Bluray1080, rules.profile.cutoff_rank())];

        let verdict = verdict_for(&candidate(&rules), &[(Some(1), Some(1))], &files, &rules.profile);

        assert!(!verdict.is_wanted(), "{verdict:?}");
    }
}
