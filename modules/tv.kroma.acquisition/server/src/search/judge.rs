//! A release judged by the title's rules, and what grabbing it would do to
//! the files the title already holds.

use kroma_scene::{
    Candidate, Evaluation, Facts, Judged, Language, QualityProfile, Query, Rules, Verdict, judge,
    upgrade_verdict,
};

use crate::dtos::{FormatScoreView, ScoredReleaseView};
use crate::peers::indexers::{IndexerRef, Release};
use crate::rules::files::JudgedFile;
use crate::search::targets::SearchTarget;

/// What every release of one search is judged under.
#[derive(Clone, Copy)]
pub struct Judge<'a> {
    pub rules: Rules<'a>,
    pub original: Option<&'a Language>,
    pub runtime_minutes: Option<u32>,
}

impl Judge<'_> {
    pub fn profile(&self) -> &QualityProfile {
        self.rules.profile
    }

    /// The release as the rules see it, refused with the rule that fired or
    /// ranked with what ranks it.
    pub fn release(
        &self,
        release: &Release,
        indexer: &IndexerRef,
        st: &SearchTarget,
    ) -> (ScoredReleaseView, Option<Judged>) {
        let parsed = kroma_scene::parse_release_name(&release.title);
        let facts = Facts::from_release(&release.title, &parsed, release.size_bytes);
        let candidate = Candidate {
            size_bytes: release.size_bytes,
            seeders: release.seeders,
            indexer_priority: indexer.priority,
        };
        let query = Query {
            target: st.target,
            runtime_minutes: self.runtime_minutes,
            original: self.original,
        };
        let outcome = judge(&parsed, &facts, &candidate, &query, &self.rules);
        let view = view_of(release, indexer, st, &facts, &outcome);
        (view, outcome.ok())
    }
}

fn view_of(
    release: &Release,
    indexer: &IndexerRef,
    st: &SearchTarget,
    facts: &Facts,
    outcome: &Result<Judged, kroma_scene::Reject>,
) -> ScoredReleaseView {
    let (score, breakdown, rejected, formats) = match outcome {
        Ok(judged) => (
            Some(judged.score()),
            judged.breakdown.iter().map(Into::into).collect(),
            None,
            judged
                .evaluation
                .formats
                .iter()
                .map(|f| FormatScoreView {
                    name: f.name.clone(),
                    score: f.score,
                })
                .collect(),
        ),
        Err(r) => (
            None,
            Vec::new(),
            Some(format!("{}: {}", r.rule, r.note)),
            Vec::new(),
        ),
    };
    ScoredReleaseView {
        title: release.title.clone(),
        guid: release.guid.clone(),
        indexer_id: indexer.id.clone(),
        indexer_name: indexer.name.clone(),
        size_bytes: release.size_bytes,
        seeders: release.seeders,
        leechers: release.leechers,
        published_at: release.published_at.clone(),
        target: st.kind.to_string(),
        season: st.season,
        episodes: st.episodes.clone(),
        score,
        breakdown,
        rejected,
        grabbable: release.magnet.is_some()
            || release.link.is_some()
            || release.details_url.is_some(),
        upgrade: false,
        details_url: release.details_url.clone(),
        quality: Some(facts.quality().id().to_string()),
        formats,
        verdict: None,
    }
}

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
