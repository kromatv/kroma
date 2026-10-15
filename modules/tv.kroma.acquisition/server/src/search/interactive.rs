//! Interactive search for one request: sweep every enabled indexer over the
//! requested scope, score everything, remember the results so a grab can reuse
//! a magnet without a re-sweep.

use std::collections::HashMap;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use kroma_module_sdk::db;
use kroma_module_sdk::engine::services::requests::today_ymd;
use kroma_module_sdk::host::HostStorage;

use crate::dtos::{InteractiveSearchView, ScoredReleaseView};
use crate::search::hits::{collect_search_hits, CachedRelease};
use crate::search::targets::{targets_for_scope, SearchScope};

mod grab;

pub use grab::grab_cached;
use grab::is_upgrade;

static SEARCH_CACHE: Mutex<Option<HashMap<String, Vec<CachedRelease>>>> = Mutex::new(None);

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
    if map.len() > 24 {
        map.clear();
    }
    map.insert(cache_key(request_id, scope), releases);
}

/// Interactive search for one request over `scope`: sweep every enabled indexer
/// and return everything, scored or rejected-with-reason, accepted-best first.
/// Synchronous and network-heavy: call from a blocking context only.
pub fn interactive_search<S: HostStorage + Clone>(
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
        collect_search_hits(state, &indexers, &targets, &profile, req.tmdb_id, None);

    // Against the REAL ledger, not the forced-wanted clone above: what the row
    // shows has to be what the grab will do.
    for c in &mut cached {
        let ids = crate::search::wanted_ids_for(&wanted, &c.view);
        c.view.upgrade = is_upgrade(&wanted, &ids);
    }

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

// The rows are synthesized from TMDB and never persisted, so a grab of one flips
// no ledger row: the availability pass picks the file up once it lands.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::hits::score_release;
    use crate::search::test_support::{episode_target, indexer, profile, release};

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
    fn the_cache_hands_a_grab_back_the_release_the_search_showed() {
        let scope = SearchScope::Episode {
            season: 4,
            episode: 2,
        };
        let view = score_release(
            &release("Show.S04E02.1080p", Some(9)),
            &indexer(0),
            &episode_target(),
            &profile(),
        );
        cache_results(
            "req-cache",
            scope,
            vec![CachedRelease {
                view,
                magnet_or_url: "magnet:?xt=2".into(),
                torrent_url: None,
                tmdb_id: 42,
            }],
        );

        let found = cached_release("req-cache", scope, "g1", "idx1").expect("cached");
        assert_eq!(
            found.magnet_or_url, "magnet:?xt=2",
            "so a grab needs no re-sweep"
        );
        assert!(cached_release("req-cache", SearchScope::All, "g1", "idx1").is_none());
        assert!(cached_release("req-cache", scope, "other", "idx1").is_none());
        assert!(cached_release("req-cache", scope, "g1", "other").is_none());
    }
}
