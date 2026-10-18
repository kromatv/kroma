//! Grabbing one release out of the last interactive search: resolve its link,
//! approve the request the grab implies, and hand the queue a spec that says
//! whether it fills a hole, replaces a file, or sits beside it.

use anyhow::{anyhow, Result};
use kroma_module_sdk::db;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Verdict;

use super::{cached_release, interactive_search, CachedRelease};
use crate::search::subject::{resolve, Subject};
use crate::search::targets::SearchScope;

/// Grab one release from the last interactive search of this subject under the
/// same scope. Returns the queued download row; the caller kicks off the (slow)
/// engine add in the background via `DownloadManager::activate`.
pub fn grab_cached<S: HostStorage>(
    state: &S,
    subject: &Subject,
    scope: SearchScope,
    guid: &str,
    indexer_id: &str,
) -> Result<crate::peers::downloads::DownloadRow> {
    // The search cache is in-memory, so a restart or a direct grab with no
    // prior search would miss it; on a miss, re-run the search and retry.
    let cached = match cached_release(subject, scope, guid, indexer_id) {
        Some(c) => c,
        None => {
            interactive_search(state, subject, scope)?;
            cached_release(subject, scope, guid, indexer_id).ok_or_else(|| {
                anyhow!("release not found on the indexer anymore; run the search again")
            })?
        }
    };
    let magnet_or_url = resolve_grab_target(state, &cached)?;
    if magnet_or_url.is_empty() {
        return Err(anyhow!("release has no magnet or download link"));
    }
    // Grabbing implies approval: a still-pending request has no wanted ledger,
    // so approve it first, or the request would stay stuck in "pending".
    if let Subject::Request { request_id } = subject {
        approve_if_needed(state, request_id)?;
    }
    let resolved = resolve(state, subject, scope)?;
    let wanted_ids = crate::search::wanted_ids_for(&resolved.ledger, &cached.view);
    let spec = crate::search::grab_spec_from_release(
        &cached.view,
        &magnet_or_url,
        cached.tmdb_id,
        Some(resolved.title),
        resolved.year,
        resolved.request_id,
        wanted_ids,
        replaces(cached.view.verdict),
    );
    let row = crate::peers::downloads::grab(state, &spec)?;
    if matches!(cached.view.verdict, Some(Verdict::Beside(_))) {
        crate::rules::store::place_beside(state.store(), &row.id)?;
    }
    Ok(row)
}

/// Whether a grab with this verdict lands on media already on disk, so the
/// import places it against the file it meets instead of skipping. An admin
/// who grabs a release the rules called no better has overridden the verdict,
/// not asked for nothing to happen.
pub fn replaces(verdict: Option<Verdict>) -> bool {
    !matches!(verdict, None | Some(Verdict::Fill))
}

fn resolve_grab_target<S: HostStorage>(state: &S, cached: &CachedRelease) -> Result<String> {
    let indexer = crate::peers::indexers::get(state, &cached.view.indexer_id)?;
    match indexer {
        Some(i) if i.kind == crate::peers::indexers::KIND_BUILTIN => {
            crate::resolve_builtin_download(
                state,
                &i.id,
                &cached.view.title,
                cached.view.details_url.as_deref(),
                &cached.magnet_or_url,
            )
        }
        _ => Ok(cached.magnet_or_url.clone()),
    }
}

fn approve_if_needed<S: HostStorage>(state: &S, request_id: &str) -> Result<()> {
    use kroma_module_sdk::engine::model::RequestStatus;
    let conn = state.db().get()?;
    let req = db::get_request(&conn, request_id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    if matches!(req.status, RequestStatus::Pending | RequestStatus::Failed) {
        kroma_module_sdk::engine::services::requests::approve_request(state, request_id, None)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_scene::Reason;

    #[test]
    fn an_upgrade_or_a_copy_beside_lands_on_what_is_on_disk() {
        assert!(replaces(Some(Verdict::Upgrade(Reason::Quality))));
        assert!(replaces(Some(Verdict::Beside(Reason::Formats))));
    }

    #[test]
    fn grabbing_a_release_the_rules_called_no_better_still_lands_on_what_is_on_disk() {
        assert!(replaces(Some(Verdict::NotBetter(Reason::LowerQuality))));
    }

    #[test]
    fn a_fill_or_an_unjudged_release_lands_in_an_empty_slot() {
        assert!(!replaces(Some(Verdict::Fill)));
        assert!(!replaces(None));
    }
}
