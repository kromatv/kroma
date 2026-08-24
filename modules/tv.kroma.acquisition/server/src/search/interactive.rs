//! Interactive search for one request: sweep every enabled indexer over the
//! requested scope, score everything, remember the results so a grab can reuse
//! a magnet without a re-sweep.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::peers::indexers::{IndexerRef, Release};
use anyhow::{anyhow, Result};
use kroma_module_sdk::db;
use kroma_module_sdk::engine::services::requests::today_ymd;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Candidate, Profile};

use crate::dtos::{InteractiveSearchView, ScoreLineView, ScoredReleaseView};
use crate::search::targets::{targets_for_scope, SearchScope, SearchTarget};

mod grab;

pub use grab::grab_cached;
use grab::is_upgrade;

/// A release remembered from the last interactive search of a request, so a
/// manual grab can reuse its magnet/.torrent link without a re-sweep.
#[derive(Clone)]
pub struct CachedRelease {
    pub view: ScoredReleaseView,
    pub magnet_or_url: String,
    pub tmdb_id: u64,
}

static SEARCH_CACHE: Mutex<Option<HashMap<String, Vec<CachedRelease>>>> = Mutex::new(None);

// One request searched under two scopes keeps both result sets, so grabbing an
// episode does not need the season sweep to be re-run.
fn cache_key(request_id: &str, scope: SearchScope) -> String {
    format!("{request_id}|{}", scope.cache_key())
}

pub fn cached_release(
    request_id: &str,
    scope: SearchScope,
    guid: &str,
    indexer_id: &str,
) -> Option<CachedRelease> {
    SEARCH_CACHE
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|m| m.get(&cache_key(request_id, scope)))
        .and_then(|list| {
            list.iter()
                .find(|c| c.view.guid == guid && c.view.indexer_id == indexer_id)
                .cloned()
        })
}

fn cache_results(request_id: &str, scope: SearchScope, releases: Vec<CachedRelease>) {
    let mut guard = SEARCH_CACHE.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    // Keep the cache small: it only serves "search then grab" round-trips.
    if map.len() > 24 {
        map.clear();
    }
    map.insert(cache_key(request_id, scope), releases);
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
        // A details URL is grabbable too: built-in indexers resolve the actual
        // magnet/.torrent from it at grab time.
        grabbable: release.magnet.is_some()
            || release.link.is_some()
            || release.details_url.is_some(),
        upgrade: false,
        details_url: release.details_url.clone(),
    }
}

/// Interactive search for one request over `scope`: sweep every enabled indexer
/// and return everything, scored or rejected-with-reason, accepted-best first.
/// Synchronous and network-heavy: call from a blocking context only.
pub fn interactive_search<S: HostStorage>(
    state: &S,
    request_id: &str,
    scope: SearchScope,
) -> Result<InteractiveSearchView> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, request_id)?.ok_or_else(|| anyhow!("request not found"))?;
    let mut wanted = db::wanted_for_request(&conn, request_id)?;
    let indexers = crate::peers::indexers::enabled(state)?;
    drop(conn);
    if indexers.is_empty() {
        return Err(anyhow!(
            "no enabled indexer; add one under Admin > Indexeurs"
        ));
    }
    // A pending request has no ledger yet: search as if it were approved, so a
    // moderator can look before green-lighting.
    if wanted.is_empty() {
        kroma_module_sdk::engine::services::requests::preview_wanted(state, &req, &mut wanted)?;
    }
    // An explicit admin search covers the request's full content regardless of
    // ledger status, so already-grabbed rows can still be (re)searched.
    // The target builders only look at `wanted` rows, so force them on a clone.
    let mut search_wanted = wanted.clone();
    for w in &mut search_wanted {
        w.status = "wanted".into();
    }
    search_wanted.extend(rows_outside_request(state, &req, &search_wanted, scope)?);

    let profile = crate::profile_from_settings(state);
    let targets = targets_for_scope(req.kind, &search_wanted, &today_ymd(), scope);
    if targets.is_empty() {
        return Ok(InteractiveSearchView {
            releases: Vec::new(),
            indexers: crate::search::sweep::unasked(&indexers),
        });
    }

    tracing::info!(
        request = %req.id,
        title = %req.title,
        scope = %scope.cache_key(),
        targets = targets.len(),
        indexers = indexers.len(),
        "interactive search starting",
    );
    let (mut cached, indexer_reports) =
        collect_search_hits(state, &indexers, &targets, &profile, req.tmdb_id);

    // Against the REAL ledger, not the forced-wanted clone above: what the row
    // shows has to be what the grab will do.
    for c in &mut cached {
        let ids = crate::search::wanted_ids_for(&wanted, &c.view);
        c.view.upgrade = is_upgrade(&wanted, &ids);
    }

    // Accepted first (best score), then rejects; capped so a broad tracker
    // sweep stays a readable list.
    cached.sort_by_key(|c| (c.view.score.is_none(), -(c.view.score.unwrap_or(0))));
    cached.truncate(150);
    let releases: Vec<ScoredReleaseView> = cached.iter().map(|c| c.view.clone()).collect();
    tracing::info!(
        request = %req.id,
        total = releases.len(),
        accepted = releases.iter().filter(|r| r.score.is_some()).count(),
        "interactive search done",
    );
    cache_results(&req.id, scope, cached);
    Ok(InteractiveSearchView {
        releases,
        indexers: indexer_reports,
    })
}

// A season the request does not cover is still worth searching: from the ledger
// an admin points at what the LIBRARY is missing, which is wider than what the
// requester asked for. The rows are synthesized from TMDB and never persisted,
// so a grab of one flips no ledger row -- the availability pass picks the file
// up once it lands.
fn rows_outside_request<S: HostStorage>(
    state: &S,
    req: &kroma_module_sdk::engine::model::MediaRequest,
    wanted: &[db::WantedRow],
    scope: SearchScope,
) -> Result<Vec<db::WantedRow>> {
    let Some(season) = scope.season() else {
        return Ok(Vec::new());
    };
    if wanted.iter().any(|w| w.season == Some(season)) {
        return Ok(Vec::new());
    }
    kroma_module_sdk::engine::services::request_ledger::preview_season_rows(state, req, season)
}

struct Hit {
    indexer_id: String,
    target: usize,
    release: Release,
}

fn collect_search_hits<S: HostStorage>(
    state: &S,
    indexers: &[IndexerRef],
    targets: &[SearchTarget],
    profile: &Profile,
    tmdb_id: u64,
) -> (Vec<CachedRelease>, Vec<crate::dtos::IndexerReport>) {
    let (hits, reports) = crate::search::sweep::sweep(indexers, |indexer| {
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
        // One target failing out of several is a partial answer, not a broken
        // tracker: only a sweep that found nothing at all reads as an error.
        if found.is_empty() && !errors.is_empty() {
            anyhow::bail!("{}", errors.join("; "));
        }
        Ok(found)
    });

    let by_id: HashMap<&str, &IndexerRef> = indexers.iter().map(|i| (i.id.as_str(), i)).collect();
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut cached: Vec<CachedRelease> = Vec::new();
    for hit in hits {
        let Some(indexer) = by_id.get(hit.indexer_id.as_str()) else {
            continue;
        };
        if !seen.insert((hit.indexer_id.clone(), hit.release.guid.clone())) {
            continue;
        }
        let view = score_release(&hit.release, indexer, &targets[hit.target], profile);
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
    (cached, reports)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_scene::{Profile, Res, Target};

    fn indexer(priority: i32) -> IndexerRef {
        IndexerRef {
            id: "idx1".into(),
            name: "Tracker".into(),
            kind: "torznab".into(),
            enabled: true,
            priority,
        }
    }

    fn profile() -> Profile {
        Profile {
            resolution: Res::R1080,
            prefer_hevc: true,
            min_seeders: 1,
            max_size_bytes_movie: 20 * 1_073_741_824,
            max_size_bytes_episode: 5 * 1_073_741_824,
            required_keywords: Vec::new(),
            forbidden_keywords: Vec::new(),
        }
    }

    fn target() -> SearchTarget {
        SearchTarget {
            query: crate::peers::indexers::Query::Episode {
                tmdb_id: Some(42),
                title: "Show".into(),
                season: 1,
                episode: 1,
            },
            target: Target::Episode {
                season: 1,
                episode: 1,
            },
            kind: "episode",
            season: Some(1),
            episodes: Some(vec![1]),
        }
    }

    fn release(title: &str, seeders: Option<u32>) -> Release {
        Release {
            title: title.into(),
            guid: "g1".into(),
            magnet: Some("magnet:?xt=1".into()),
            size_bytes: Some(1_073_741_824),
            seeders,
            leechers: Some(2),
            published_at: Some("2024-01-01".into()),
            details_url: Some("https://t/1".into()),
            ..Default::default()
        }
    }

    #[test]
    fn two_scopes_of_one_request_do_not_share_a_cache_slot() {
        let a = cache_key("r1", SearchScope::Season { season: 1 });
        let b = cache_key(
            "r1",
            SearchScope::Episode {
                season: 1,
                episode: 1,
            },
        );
        assert_ne!(a, b);
        assert_ne!(a, cache_key("r2", SearchScope::Season { season: 1 }));
    }

    #[test]
    fn a_scored_release_carries_the_target_it_was_judged_against() {
        let view = score_release(
            &release("Show.S01E01.1080p.WEB-DL.x265-GRP", Some(20)),
            &indexer(0),
            &target(),
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
        // Under the seeder floor: shown anyway, because "why was this rejected"
        // is the question the table exists to answer.
        let view = score_release(
            &release("Show.S01E01.1080p", Some(0)),
            &indexer(0),
            &target(),
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
        assert!(!score_release(&bare, &indexer(0), &target(), &profile()).grabbable);
    }

    #[test]
    fn a_details_page_alone_is_grabbable_because_the_link_resolves_from_it() {
        let mut only_details = release("Show.S01E01.1080p", Some(9));
        only_details.magnet = None;
        only_details.link = None;
        assert!(score_release(&only_details, &indexer(0), &target(), &profile()).grabbable);
    }

    #[test]
    fn the_cache_hands_a_grab_back_the_release_the_search_showed() {
        let scope = SearchScope::Episode {
            season: 4,
            episode: 2,
        };
        let view = score_release(
            &release("Show.S04E02.1080p", Some(9)),
            &indexer(0),
            &target(),
            &profile(),
        );
        cache_results(
            "req-cache",
            scope,
            vec![CachedRelease {
                view,
                magnet_or_url: "magnet:?xt=2".into(),
                tmdb_id: 42,
            }],
        );

        let found = cached_release("req-cache", scope, "g1", "idx1").expect("cached");
        assert_eq!(
            found.magnet_or_url, "magnet:?xt=2",
            "so a grab needs no re-sweep"
        );
        // A different scope, indexer or guid is a different question.
        assert!(cached_release("req-cache", SearchScope::All, "g1", "idx1").is_none());
        assert!(cached_release("req-cache", scope, "other", "idx1").is_none());
        assert!(cached_release("req-cache", scope, "g1", "other").is_none());
    }
}
