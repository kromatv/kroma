use anyhow::Result;

use kroma_module_host::HostStorage;
use kroma_primitives::now_ms;

use crate::db;
use crate::model::{EpisodeRef, RequestKind, SearchNow};

/// The bare point an acquisition module answers. The core may name this one.
const ACQUISITION: &str = "acquisition";

/// Puts the title's missing units back at the front of the search queue,
/// narrowed to `units` when the caller named some, then asks whoever answers the
/// `acquisition` point to go and look NOW rather than waiting for the next pass,
/// which is off entirely while automatic acquisition is disabled. Answers what
/// the module made of it; a refusal is a reason, never silence.
pub fn search_now<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[EpisodeRef],
) -> Result<SearchNow> {
    requeue(state, kind, tmdb_id, units)?;
    let Some(resolve) = kroma_module_host::pinned_resolver(state, ACQUISITION, None) else {
        return Ok(SearchNow::refused("noModule"));
    };
    let body = serde_json::json!({
        "kind": kind.as_str(),
        "tmdb_id": tmdb_id,
        "units": units.iter().map(|u| serde_json::json!({ "season": u.season, "episode": u.episode })).collect::<Vec<_>>(),
    });
    match kroma_module_host::call_point(&resolve, ACQUISITION, "search-now", &body) {
        Ok(answer) => Ok(answer),
        Err(e) => {
            tracing::warn!("acquisition search-now failed: {e:#}");
            Ok(SearchNow::refused("failed"))
        }
    }
}

fn requeue<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[EpisodeRef],
) -> Result<usize> {
    let conn = state.db().get()?;
    let wanted: Vec<String> = db::wanted_for_title(&conn, kind, tmdb_id)?
        .into_iter()
        .filter(|w| w.status == "wanted" && covers(units, w.season, w.episode))
        .map(|w| w.id)
        .collect();
    drop(conn);
    db::reset_wanted_search(state.db(), &wanted, now_ms())?;
    Ok(wanted.len())
}

fn covers(units: &[EpisodeRef], season: Option<u32>, episode: Option<u32>) -> bool {
    if units.is_empty() {
        return true;
    }
    let (Some(season), Some(episode)) = (season, episode) else {
        return false;
    };
    units
        .iter()
        .any(|u| u.season == season && u.episode == episode)
}
