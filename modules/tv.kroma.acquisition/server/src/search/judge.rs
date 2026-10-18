//! A release judged by the title's rules, and what grabbing it would do to
//! the files the title already holds.

use kroma_scene::{Candidate, Facts, Judged, Language, QualityProfile, Query, Rules, judge};

use crate::dtos::{FormatScoreView, RefusalView, ScoredReleaseView};
use crate::peers::indexers::{IndexerRef, Release};
use crate::release_flags::{ReleaseFlag, flags_of};
use crate::rules::files::{JudgedFile, title_runtime};
use crate::search::targets::SearchTarget;

/// What every release of one search is judged under.
#[derive(Clone, Copy)]
pub struct Judge<'a> {
    pub rules: Rules<'a>,
    pub original: Option<&'a Language>,
    pub runtime_minutes: Option<u32>,
}

impl<'a> Judge<'a> {
    /// The rules as they judge one title, taking the runtime a per-minute size
    /// limit needs from the files it already holds. A title that holds none
    /// leaves it unknown, and the sizes table's own runtime stands in.
    pub fn for_title(
        rules: Rules<'a>,
        original: Option<&'a Language>,
        files: &[JudgedFile],
    ) -> Self {
        Self {
            rules,
            original,
            runtime_minutes: title_runtime(files),
        }
    }

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
        let flags = flags_of(release.download_volume_factor, release.upload_volume_factor);
        let facts = Facts::from_release(&release.title, &parsed, release.size_bytes)
            .with_flags(flags.iter().copied().map(kroma_scene::IndexerFlag::from));
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
        let view = view_of(release, indexer, st, &facts, flags, &outcome);
        (view, outcome.ok())
    }
}

fn view_of(
    release: &Release,
    indexer: &IndexerRef,
    st: &SearchTarget,
    facts: &Facts,
    flags: Vec<ReleaseFlag>,
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
    let refusal = outcome.as_ref().err().map(RefusalView::from);
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
        refusal,
        grabbable: release.magnet.is_some()
            || release.link.is_some()
            || release.details_url.is_some(),
        upgrade: false,
        details_url: release.details_url.clone(),
        quality: Some(facts.quality().id().to_string()),
        formats,
        flags,
        verdict: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::files::JudgedFile;
    use crate::search::test_support::TestRules;
    use kroma_scene::Quality;

    fn held(minutes: Option<u32>) -> JudgedFile {
        JudgedFile {
            file_id: "f1".into(),
            rel_path: None,
            season: Some(1),
            episode: Some(1),
            episode_end: None,
            release: None,
            runtime_minutes: minutes,
            evaluation: kroma_scene::Evaluation {
                quality: Quality::WebDl1080,
                quality_rank: Some(1),
                formats: Vec::new(),
                format_score: 0,
                revision: 1,
            },
            below_target: false,
        }
    }

    #[test]
    fn a_title_is_judged_against_the_runtime_its_own_files_measure() {
        let rules = TestRules::new();

        let judge = Judge::for_title(rules.judge().rules, None, &[held(Some(22))]);

        assert_eq!(judge.runtime_minutes, Some(22));
    }

    #[test]
    fn a_title_that_holds_nothing_leaves_the_sizes_table_to_say_how_long_a_unit_runs() {
        let rules = TestRules::new();

        let judge = Judge::for_title(rules.judge().rules, None, &[]);

        assert_eq!(judge.runtime_minutes, None);
    }

    #[test]
    fn a_freeleech_release_says_so_on_the_view_the_admin_reads() {
        let rules = TestRules::new();
        let freeleech = Release {
            download_volume_factor: Some(0.0),
            upload_volume_factor: Some(2.0),
            ..crate::search::test_support::release("Show.S01E01.1080p.WEB-DL.x265", Some(9))
        };

        let (view, _) = rules.judge().release(
            &freeleech,
            &crate::search::test_support::indexer(0),
            &crate::search::test_support::episode_target(),
        );

        assert_eq!(
            view.flags,
            [ReleaseFlag::Freeleech, ReleaseFlag::DoubleUpload]
        );
    }

    #[test]
    fn every_flag_a_tracker_announces_reaches_the_rules() {
        let rules = TestRules::new();
        let bonuses = Release {
            download_volume_factor: Some(0.5),
            upload_volume_factor: Some(2.0),
            ..crate::search::test_support::release("Show.S01E01.1080p.WEB-DL.x265", Some(9))
        };

        let (view, _) = rules.judge().release(
            &bonuses,
            &crate::search::test_support::indexer(0),
            &crate::search::test_support::episode_target(),
        );

        assert_eq!(
            view.flags,
            [ReleaseFlag::Halfleech, ReleaseFlag::DoubleUpload]
        );
    }

    #[test]
    fn a_refused_release_carries_the_rule_and_what_the_sentence_needs() {
        let rules = TestRules::new();
        let cam = crate::search::test_support::release("Show.S01E01.CAM.XviD", Some(9));

        let (view, _) = rules.judge().release(
            &cam,
            &crate::search::test_support::indexer(0),
            &crate::search::test_support::episode_target(),
        );

        let refusal = view.refusal.expect("a refusal");
        assert_eq!(refusal.rule, "quality");
        assert_eq!(refusal.params["quality"], "cam");
    }

    #[test]
    fn an_accepted_release_carries_no_refusal_and_a_breakdown_that_can_be_translated() {
        let rules = TestRules::new();

        let (view, _) = rules.judge().release(
            &crate::search::test_support::release("Show.S01E01.1080p.WEB-DL.x265", Some(9)),
            &crate::search::test_support::indexer(0),
            &crate::search::test_support::episode_target(),
        );

        assert!(view.refusal.is_none());
        let quality = view.breakdown.iter().find(|l| l.code == "quality").unwrap();
        assert_eq!(quality.params["quality"], "webdl-1080p");
    }
}
