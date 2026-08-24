//! Grabbing one release out of the last interactive search: resolve its link,
//! approve the request the grab implies, and hand the queue a spec that says
//! whether it fills a hole or replaces a file.

use anyhow::{anyhow, Result};
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::host::HostStorage;

use super::{cached_release, interactive_search, CachedRelease};
use crate::search::targets::SearchScope;

/// Grab one release from the last interactive search of this request under the
/// same scope. Returns the queued download row; the caller kicks off the (slow)
/// engine add in the background via `DownloadManager::activate`.
pub fn grab_cached<S: HostStorage>(
    state: &S,
    request_id: &str,
    scope: SearchScope,
    guid: &str,
    indexer_id: &str,
) -> Result<crate::peers::downloads::DownloadRow> {
    // The search cache is in-memory, so a restart or a direct grab with no
    // prior search would miss it; on a miss, re-run the search and retry.
    let cached = match cached_release(request_id, scope, guid, indexer_id) {
        Some(c) => c,
        None => {
            interactive_search(state, request_id, scope)?;
            cached_release(request_id, scope, guid, indexer_id).ok_or_else(|| {
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
    approve_if_needed(state, request_id)?;

    let conn = state.db().get()?;
    let req = db::get_request(&conn, request_id)?.ok_or_else(|| anyhow!("request not found"))?;
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let wanted_ids = crate::search::wanted_ids_for(&wanted, &cached.view);
    // Everything this grab covers is already on disk: it can only be an upgrade,
    // and the import replaces the file it improves instead of sitting beside it.
    let upgrade = is_upgrade(&wanted, &wanted_ids);
    let spec = crate::search::grab_spec_from_release(
        &cached.view,
        &magnet_or_url,
        cached.tmdb_id,
        Some(req.title),
        req.year,
        Some(request_id.to_string()),
        wanted_ids,
        upgrade,
    );
    crate::peers::downloads::grab(state, &spec)
}

// A built-in indexer may need a details-page fetch to turn a search row into a
// magnet / .torrent link.
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

pub(super) fn is_upgrade(wanted: &[WantedRow], covered: &[String]) -> bool {
    // `grabbed` is a download queued with nothing imported yet, so there is no
    // file to improve: only `available` means the episode is on disk.
    !covered.is_empty()
        && covered.iter().all(|id| {
            wanted
                .iter()
                .any(|w| &w.id == id && w.status == "available")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, status: &str) -> WantedRow {
        WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "Show".into(),
            year: None,
            season: Some(1),
            episode: Some(1),
            air_date: None,
            status: status.into(),
            last_search_at: None,
        }
    }

    #[test]
    fn a_grab_covering_only_rows_on_disk_is_an_upgrade() {
        let wanted = vec![row("a", "available"), row("b", "available")];
        assert!(is_upgrade(&wanted, &["a".into(), "b".into()]));
    }

    #[test]
    fn a_grab_covering_a_still_missing_row_is_not_an_upgrade() {
        let wanted = vec![row("a", "available"), row("b", "wanted")];
        assert!(!is_upgrade(&wanted, &["a".into(), "b".into()]));
    }

    #[test]
    fn a_grab_covering_nothing_is_not_an_upgrade() {
        assert!(!is_upgrade(&[row("a", "available")], &[]));
    }

    #[test]
    fn a_grab_covering_a_queued_download_is_not_an_upgrade() {
        let wanted = vec![row("a", "available"), row("b", "grabbed")];
        assert!(!is_upgrade(&wanted, &["a".into(), "b".into()]));
    }
}
