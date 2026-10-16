//! Interactive search for one request or one title: sweep every enabled
//! indexer over the scope, judge everything by the title's rules and against
//! what it holds, and remember the results so a grab can reuse a magnet
//! without a re-sweep.

use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use kroma_module_sdk::engine::services::requests::today_ymd;
use kroma_module_sdk::host::HostStorage;

use crate::dtos::{InteractiveSearchView, ScoredReleaseView};
use crate::rules::files::{judge_title_files, JudgedFile};
use crate::search::hits::{collect_search_hits, CachedRelease};
use crate::search::judge::{units_of, verdict_for, Judge};
use crate::search::subject::{resolve, Subject};
use crate::search::targets::{targets_for_scope, SearchScope};

mod grab;

pub use grab::{grab_cached, replaces};

static SEARCH_CACHE: Mutex<Option<HashMap<String, Vec<CachedRelease>>>> = Mutex::new(None);

pub fn cached_release(
    subject: &Subject,
    scope: SearchScope,
    guid: &str,
    indexer_id: &str,
) -> Option<CachedRelease> {
    SEARCH_CACHE
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|m| m.get(&subject.cache_key(scope)))
        .and_then(|list| {
            list.iter()
                .find(|c| c.view.guid == guid && c.view.indexer_id == indexer_id)
                .cloned()
        })
}

fn cache_results(subject: &Subject, scope: SearchScope, releases: Vec<CachedRelease>) {
    let mut guard = SEARCH_CACHE.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    if map.len() > 24 {
        map.clear();
    }
    map.insert(subject.cache_key(scope), releases);
}

/// Interactive search for `subject` over `scope`: sweep every enabled indexer
/// and return everything, judged or rejected-with-reason, best first.
/// Synchronous and network-heavy: call from a blocking context only.
pub fn interactive_search<S: HostStorage>(
    state: &S,
    subject: &Subject,
    scope: SearchScope,
) -> Result<InteractiveSearchView> {
    let resolved = resolve(state, subject, scope)?;
    let indexers = crate::peers::indexers::enabled(state)?;
    if indexers.is_empty() {
        return Err(anyhow!(
            "no enabled indexer; add one under Admin > Indexeurs"
        ));
    }
    let targets = targets_for_scope(resolved.kind, &resolved.searched, &today_ymd(), scope);
    if targets.is_empty() {
        return Ok(InteractiveSearchView {
            releases: Vec::new(),
            indexers: crate::search::sweep::unasked(&indexers),
        });
    }

    let book = crate::rules::load(state)?;
    let profile = book.profile_for(state, resolved.kind, resolved.tmdb_id)?;
    let original = crate::rules::original_language(state, resolved.kind, resolved.tmdb_id)?;
    let judge = Judge {
        rules: book.rules(profile),
        original: original.as_ref(),
        runtime_minutes: None,
    };
    tracing::info!(
        subject = %subject.cache_key(scope),
        title = %resolved.title,
        targets = targets.len(),
        indexers = indexers.len(),
        "interactive search starting",
    );
    let (mut cached, indexer_reports) =
        collect_search_hits(state, &indexers, &targets, &judge, resolved.tmdb_id);
    let files = judge_title_files(
        state,
        resolved.kind,
        resolved.tmdb_id,
        &judge.rules,
        original.as_ref(),
    )?;
    let blocked = crate::rules::blocklist::for_title(state.store(), resolved.kind, resolved.tmdb_id)?;
    for c in &mut cached {
        if blocked.iter().any(|b| b.matches(&c.view.title)) {
            refuse(c, "blocklist: an earlier grab of this release failed");
            continue;
        }
        settle_verdict(c, &files, judge.profile());
    }

    cached.sort_by(best_first);
    cached.truncate(150);
    let releases: Vec<ScoredReleaseView> = cached.iter().map(|c| c.view.clone()).collect();
    tracing::info!(
        subject = %subject.cache_key(scope),
        total = releases.len(),
        accepted = releases.iter().filter(|r| r.score.is_some()).count(),
        "interactive search done",
    );
    cache_results(subject, scope, cached);
    Ok(InteractiveSearchView {
        releases,
        indexers: indexer_reports,
    })
}

fn settle_verdict(c: &mut CachedRelease, files: &[JudgedFile], profile: &kroma_scene::QualityProfile) {
    let Some(judged) = &c.judged else {
        return;
    };
    let units = units_of(&c.view, files);
    let verdict = verdict_for(&judged.evaluation, &units, files, profile);
    c.view.verdict = Some(verdict);
    c.view.upgrade = replaces(Some(verdict));
}

fn refuse(c: &mut CachedRelease, why: &str) {
    c.judged = None;
    c.view.score = None;
    c.view.breakdown.clear();
    c.view.rejected = Some(why.to_string());
}

/// Accepted releases first, by the rules' ranking; refused ones after.
pub(crate) fn best_first(a: &CachedRelease, b: &CachedRelease) -> Ordering {
    match (&a.judged, &b.judged) {
        (Some(x), Some(y)) => kroma_scene::rank(y, x),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::{episode_target, indexer, release, TestRules};

    fn cached(name: &str, seeders: u32, rules: &TestRules) -> CachedRelease {
        let (view, judged) = rules
            .judge()
            .release(&release(name, Some(seeders)), &indexer(0), &episode_target());
        CachedRelease {
            view,
            judged,
            magnet_or_url: "magnet:?xt=2".into(),
            tmdb_id: 42,
        }
    }

    #[test]
    fn two_scopes_of_one_subject_do_not_share_a_cache_slot() {
        let subject = Subject::request("r1");

        let a = subject.cache_key(SearchScope::Season { season: 1 });
        let b = subject.cache_key(SearchScope::Episode {
            season: 1,
            episode: 1,
        });

        assert_ne!(a, b);
        assert_ne!(a, Subject::request("r2").cache_key(SearchScope::Season { season: 1 }));
    }

    #[test]
    fn the_cache_hands_a_grab_back_the_release_the_search_showed() {
        let rules = TestRules::new();
        let subject = Subject::request("req-cache");
        let scope = SearchScope::Episode {
            season: 4,
            episode: 2,
        };
        cache_results(&subject, scope, vec![cached("Show.S04E02.1080p", 9, &rules)]);

        let found = cached_release(&subject, scope, "g1", "idx1").expect("cached");

        assert_eq!(found.magnet_or_url, "magnet:?xt=2");
        assert!(cached_release(&subject, SearchScope::All, "g1", "idx1").is_none());
        assert!(cached_release(&subject, scope, "other", "idx1").is_none());
        assert!(cached_release(&subject, scope, "g1", "other").is_none());
    }

    #[test]
    fn the_rules_rank_order_puts_the_best_first_and_the_refused_last() {
        let rules = TestRules::new();
        let mut list = [
            cached("Show.S01E01.1080p.WEB-DL.x264", 50, &rules),
            cached("Show.S01E01.2160p.WEB-DL.x265", 50, &rules),
            cached("Show.S01E01.1080p.WEB-DL.x265", 50, &rules),
        ];

        list.sort_by(best_first);

        let order: Vec<&str> = list.iter().map(|c| c.view.title.as_str()).collect();
        assert_eq!(
            order,
            [
                "Show.S01E01.1080p.WEB-DL.x265",
                "Show.S01E01.1080p.WEB-DL.x264",
                "Show.S01E01.2160p.WEB-DL.x265"
            ]
        );
    }

    #[test]
    fn a_release_with_nothing_on_disk_fills_the_slot() {
        let rules = TestRules::new();
        let mut c = cached("Show.S01E01.1080p.WEB-DL.x265", 50, &rules);

        settle_verdict(&mut c, &[], &rules.profile);

        assert_eq!(c.view.verdict, Some(kroma_scene::Verdict::Fill));
        assert!(!c.view.upgrade);
    }

    #[test]
    fn a_refused_release_loses_its_rank_and_says_why() {
        let rules = TestRules::new();
        let mut c = cached("Show.S01E01.1080p.WEB-DL.x265", 50, &rules);

        refuse(&mut c, "blocklist: x");

        assert!(c.judged.is_none());
        assert_eq!(c.view.score, None);
        assert_eq!(c.view.rejected.as_deref(), Some("blocklist: x"));
    }
}
