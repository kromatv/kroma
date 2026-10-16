//! What one sweep found, judged: every target asked of an indexer, duplicates
//! dropped, and each release judged by the title's rules or rejected with the
//! rule that fired.

use std::collections::HashMap;

use anyhow::Result;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Judged;

use crate::dtos::{IndexerReport, ScoredReleaseView};
use crate::peers::indexers::{IndexerRef, Release};
use crate::search::judge::Judge;
use crate::search::sweep::sweep;
use crate::search::targets::SearchTarget;

/// A judged release and the link a grab of it can use.
#[derive(Clone)]
pub struct CachedRelease {
    pub view: ScoredReleaseView,
    pub judged: Option<Judged>,
    pub magnet_or_url: String,
    pub tmdb_id: u64,
}

struct Hit {
    indexer_id: String,
    target: usize,
    release: Release,
}

fn ask_indexer<S: HostStorage>(
    state: &S,
    indexer: &IndexerRef,
    targets: &[SearchTarget],
) -> Result<Vec<Hit>> {
    let mut found: Vec<Hit> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    for (target, st) in targets.iter().enumerate() {
        match crate::search_indexer(state, indexer, &st.query) {
            Ok(releases) => found.extend(releases.into_iter().map(|release| Hit {
                indexer_id: indexer.id.clone(),
                target,
                release,
            })),
            Err(e) => errors.push(format!("{e:#}")),
        }
    }
    if found.is_empty() && !errors.is_empty() {
        anyhow::bail!("{}", errors.join("; "));
    }
    Ok(found)
}

fn scored_hits(
    hits: Vec<Hit>,
    indexers: &[IndexerRef],
    targets: &[SearchTarget],
    judge: &Judge,
    tmdb_id: u64,
) -> Vec<CachedRelease> {
    let by_id: HashMap<&str, &IndexerRef> = indexers.iter().map(|i| (i.id.as_str(), i)).collect();
    let mut seen: HashMap<(String, String), usize> = HashMap::new();
    let mut cached: Vec<CachedRelease> = Vec::new();
    for hit in hits {
        let Some(indexer) = by_id.get(hit.indexer_id.as_str()) else {
            continue;
        };
        let (view, judged) = judge.release(&hit.release, indexer, &targets[hit.target]);
        let key = (hit.indexer_id.clone(), hit.release.guid.clone());
        if let Some(&at) = seen.get(&key) {
            let kept = &cached[at];
            let better = judged.is_some() || (misfit(&kept.view) && !misfit(&view));
            if kept.judged.is_none() && better {
                cached[at].view = view;
                cached[at].judged = judged;
            }
            continue;
        }
        seen.insert(key, cached.len());
        let magnet_or_url = hit
            .release
            .magnet
            .clone()
            .or_else(|| hit.release.link.clone())
            .unwrap_or_default();
        cached.push(CachedRelease {
            view,
            judged,
            magnet_or_url,
            tmdb_id,
        });
    }
    cached
}

fn misfit(view: &ScoredReleaseView) -> bool {
    view.rejected.as_deref().is_some_and(|why| why.starts_with("wrong-"))
}

pub(crate) fn collect_search_hits<S: HostStorage>(
    state: &S,
    indexers: &[IndexerRef],
    targets: &[SearchTarget],
    judge: &Judge,
    tmdb_id: u64,
) -> (Vec<CachedRelease>, Vec<IndexerReport>) {
    let (hits, reports) = sweep(indexers, |indexer| ask_indexer(state, indexer, targets));
    (
        scored_hits(hits, indexers, targets, judge, tmdb_id),
        reports,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::{episode_target, indexer, release, TestRules};
    use kroma_module_sdk::host::testing::StubHost;

    fn score_release(
        release: &Release,
        indexer: &IndexerRef,
        st: &SearchTarget,
        rules: &TestRules,
    ) -> ScoredReleaseView {
        rules.judge().release(release, indexer, st).0
    }

    #[test]
    fn a_judged_release_names_its_quality_and_formats() {
        let view = score_release(
            &release("Show.S01E01.1080p.WEB-DL.DV.x265-GRP", Some(20)),
            &indexer(0),
            &episode_target(),
            &TestRules::new(),
        );

        assert_eq!(view.quality.as_deref(), Some("webdl-1080p"));
        let names: Vec<&str> = view.formats.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"HEVC"));
        assert!(names.contains(&"Dolby Vision"));
    }

    #[test]
    fn a_scored_release_carries_the_target_it_was_judged_against() {
        let view = score_release(
            &release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(20)),
            &indexer(0),
            &episode_target(),
            &TestRules::new(),
        );
        assert_eq!(view.indexer_id, "idx1");
        assert_eq!(view.indexer_name, "Tracker");
        assert_eq!(
            view.target, "episode",
            "what a grab of it would be filed as"
        );
        assert_eq!(view.season, Some(1));
        assert_eq!(view.episodes, Some(vec![1]));
        assert!(view.score.is_some(), "accepted, so it has a rank");
        assert!(view.rejected.is_none());
        assert!(
            !view.breakdown.is_empty(),
            "and the reasons behind that rank"
        );
        assert!(view.grabbable);
        assert!(!view.upgrade, "decided later, against the real ledger");
    }

    #[test]
    fn a_release_the_profile_refuses_keeps_its_reason_instead_of_a_score() {
        let view = score_release(
            &release("Show.S01E01.1080p", Some(0)),
            &indexer(0),
            &episode_target(),
            &TestRules::new(),
        );
        assert!(view.score.is_none());
        let reason = view
            .rejected
            .expect("a rejected release says which rule fired");
        assert!(
            reason.contains(':'),
            "rule and note, not a bare word: {reason}"
        );
        assert!(view.breakdown.is_empty());
    }

    #[test]
    fn a_release_with_no_link_of_any_kind_is_not_grabbable() {
        let mut bare = release("Show.S01E01.1080p", Some(9));
        bare.magnet = None;
        bare.link = None;
        bare.details_url = None;
        assert!(!score_release(&bare, &indexer(0), &episode_target(), &TestRules::new()).grabbable);
    }

    #[test]
    fn a_details_page_alone_is_grabbable_because_the_link_resolves_from_it() {
        let mut only_details = release("Show.S01E01.1080p", Some(9));
        only_details.magnet = None;
        only_details.link = None;
        assert!(score_release(&only_details, &indexer(0), &episode_target(), &TestRules::new()).grabbable);
    }

    #[test]
    fn the_same_release_answered_twice_by_one_indexer_is_kept_once() {
        let hit = || Hit {
            indexer_id: "idx1".into(),
            target: 0,
            release: release("Show.S01E01.1080p", Some(9)),
        };
        let hits = vec![hit(), hit()];

        let rules = TestRules::new();
        let found = scored_hits(hits, &[indexer(0)], &[episode_target()], &rules.judge(), 42);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].tmdb_id, 42);
    }

    #[test]
    fn a_release_one_target_rejects_is_kept_under_the_target_that_accepts_it() {
        let pack = |target| Hit {
            indexer_id: "idx1".into(),
            target,
            release: release("Show.S01.1080p.WEB.x264-GRP", Some(9)),
        };
        let targets = [
            episode_target(),
            SearchTarget::season(42, "Show".into(), 1, 10, None),
        ];

        let rules = TestRules::new();
        let found = scored_hits(vec![pack(0), pack(1)], &[indexer(0)], &targets, &rules.judge(), 42);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].view.target, "season");
        assert!(found[0].view.score.is_some());
    }

    #[test]
    fn a_release_every_target_refuses_keeps_the_reason_of_the_one_it_fits() {
        let episode = |target| Hit {
            indexer_id: "idx1".into(),
            target,
            release: release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(0)),
        };
        let targets = [
            SearchTarget::season(42, "Show".into(), 1, 10, None),
            episode_target(),
        ];
        let rules = TestRules::new();

        let found = scored_hits(vec![episode(0), episode(1)], &[indexer(0)], &targets, &rules.judge(), 42);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].view.target, "episode");
        assert!(found[0].view.rejected.as_deref().is_some_and(|why| why.starts_with("seeders")));
    }

    #[test]
    fn a_hit_from_an_indexer_the_sweep_never_asked_is_dropped() {
        let hits = vec![Hit {
            indexer_id: "ghost".into(),
            target: 0,
            release: release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(9)),
        }];

        let rules = TestRules::new();
        let found = scored_hits(hits, &[indexer(0)], &[episode_target()], &rules.judge(), 42);

        assert!(found.is_empty());
    }

    #[test]
    fn an_indexer_nothing_answers_for_reports_its_error_and_no_rows() {
        let host = StubHost::new();

        let rules = TestRules::new();
        let (found, reports) =
            collect_search_hits(&host, &[indexer(0)], &[episode_target()], &rules.judge(), 42);

        assert!(found.is_empty());
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].id, "idx1");
        assert_eq!(reports[0].found, 0);
        assert!(reports[0].error.is_some());
    }

    #[test]
    fn a_sweep_with_no_target_to_ask_about_finds_nothing_and_blames_nobody() {
        let host = StubHost::new();

        let rules = TestRules::new();
        let (found, reports) = collect_search_hits(&host, &[indexer(0)], &[], &rules.judge(), 42);

        assert!(found.is_empty());
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].error, None);
    }
}
