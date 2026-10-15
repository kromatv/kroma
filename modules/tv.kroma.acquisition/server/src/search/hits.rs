//! What one sweep found, judged: every target asked of an indexer, duplicates
//! dropped, and each release scored against the profile or rejected with the
//! rule that fired.

use std::collections::HashMap;

use anyhow::Result;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Candidate, Profile};

use crate::dtos::{IndexerReport, ScoreLineView, ScoredReleaseView};
use crate::peers::indexers::{IndexerRef, Release};
use crate::search::sweep::sweep;
use crate::search::targets::SearchTarget;

/// A scored release and the link a grab of it can use.
#[derive(Clone)]
pub struct CachedRelease {
    pub view: ScoredReleaseView,
    pub magnet_or_url: String,
    pub tmdb_id: u64,
}

pub fn score_release(
    release: &Release,
    indexer: &IndexerRef,
    st: &SearchTarget,
    profile: &Profile,
) -> ScoredReleaseView {
    let parsed = kroma_scene::parse_release_name(&release.title);
    let candidate = Candidate {
        size_bytes: release.size_bytes,
        seeders: release.seeders,
        indexer_priority: indexer.priority,
    };
    let (score, breakdown, rejected) =
        match kroma_scene::score(&parsed, &candidate, &st.target, profile, &release.title) {
            Ok(s) => (
                Some(s.score),
                s.breakdown
                    .into_iter()
                    .map(|l| ScoreLineView {
                        rule: l.rule,
                        delta: l.delta,
                        note: l.note,
                    })
                    .collect(),
                None,
            ),
            Err(r) => (None, Vec::new(), Some(format!("{}: {}", r.rule, r.note))),
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
    }
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
    profile: &Profile,
    tmdb_id: u64,
) -> Vec<CachedRelease> {
    let by_id: HashMap<&str, &IndexerRef> = indexers.iter().map(|i| (i.id.as_str(), i)).collect();
    let mut seen: HashMap<(String, String), usize> = HashMap::new();
    let mut cached: Vec<CachedRelease> = Vec::new();
    for hit in hits {
        let Some(indexer) = by_id.get(hit.indexer_id.as_str()) else {
            continue;
        };
        let view = score_release(&hit.release, indexer, &targets[hit.target], profile);
        let key = (hit.indexer_id.clone(), hit.release.guid.clone());
        if let Some(&at) = seen.get(&key) {
            if cached[at].view.score.is_none() && view.score.is_some() {
                cached[at].view = view;
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
            magnet_or_url,
            tmdb_id,
        });
    }
    cached
}

pub(crate) fn collect_search_hits<S: HostStorage>(
    state: &S,
    indexers: &[IndexerRef],
    targets: &[SearchTarget],
    profile: &Profile,
    tmdb_id: u64,
) -> (Vec<CachedRelease>, Vec<IndexerReport>) {
    let (hits, reports) = sweep(indexers, |indexer| ask_indexer(state, indexer, targets));
    (
        scored_hits(hits, indexers, targets, profile, tmdb_id),
        reports,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::{episode_target, indexer, profile, release};
    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_scored_release_carries_the_target_it_was_judged_against() {
        let view = score_release(
            &release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(20)),
            &indexer(0),
            &episode_target(),
            &profile(),
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
            &profile(),
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
        assert!(!score_release(&bare, &indexer(0), &episode_target(), &profile()).grabbable);
    }

    #[test]
    fn a_details_page_alone_is_grabbable_because_the_link_resolves_from_it() {
        let mut only_details = release("Show.S01E01.1080p", Some(9));
        only_details.magnet = None;
        only_details.link = None;
        assert!(score_release(&only_details, &indexer(0), &episode_target(), &profile()).grabbable);
    }

    #[test]
    fn the_same_release_answered_twice_by_one_indexer_is_kept_once() {
        let hit = || Hit {
            indexer_id: "idx1".into(),
            target: 0,
            release: release("Show.S01E01.1080p", Some(9)),
        };
        let hits = vec![hit(), hit()];

        let found = scored_hits(hits, &[indexer(0)], &[episode_target()], &profile(), 42);

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

        let found = scored_hits(
            vec![pack(0), pack(1)],
            &[indexer(0)],
            &targets,
            &profile(),
            42,
        );

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].view.target, "season");
        assert!(found[0].view.score.is_some());
    }

    #[test]
    fn a_hit_from_an_indexer_the_sweep_never_asked_is_dropped() {
        let hits = vec![Hit {
            indexer_id: "ghost".into(),
            target: 0,
            release: release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(9)),
        }];

        let found = scored_hits(hits, &[indexer(0)], &[episode_target()], &profile(), 42);

        assert!(found.is_empty());
    }

    // No indexer module installed: every target fails for the same reason, which
    // is the indexer's report to carry rather than the sweep's to fail on.
    #[test]
    fn an_indexer_nothing_answers_for_reports_its_error_and_no_rows() {
        let host = StubHost::new();

        let (found, reports) = collect_search_hits(
            &host,
            &[indexer(0)],
            &[episode_target()],
            &profile(),
            42,
        );

        assert!(found.is_empty());
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].id, "idx1");
        assert_eq!(reports[0].found, 0);
        assert!(reports[0].error.is_some());
    }

    #[test]
    fn a_sweep_with_no_target_to_ask_about_finds_nothing_and_blames_nobody() {
        let host = StubHost::new();

        let (found, reports) = collect_search_hits(&host, &[indexer(0)], &[], &profile(), 42);

        assert!(found.is_empty());
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].error, None);
    }
}
