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
