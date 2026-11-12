use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{MediaRequest, RequestKind};

use super::{fetch_detail, season_episodes};

/// The wanted rows a season WOULD get, for a season the request does not cover.
/// Persists nothing: it exists so an interactive search can be aimed at a season
/// outside the request, which is most of what an admin looks for.
pub fn preview_season_rows<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    season: u32,
) -> Result<Vec<db::WantedRow>> {
    if req.kind != RequestKind::Show {
        return Ok(Vec::new());
    }
    let language = state.metadata_language();
    let detail = fetch_detail(state, req.kind, req.tmdb_id, &language)?;
    Ok(season_episodes(state, req.tmdb_id, season, &language)?
        .into_iter()
        .map(|ep| db::WantedRow {
            id: format!("preview|{}|s{season:02}e{:03}", req.id, ep.episode),
            request_id: Some(req.id.clone()),
            kind: "episode".into(),
            tmdb_id: req.tmdb_id,
            imdb_id: detail.imdb_id.clone(),
            title: req.title.clone(),
            year: req.year,
            season: Some(season),
            episode: Some(ep.episode),
            air_date: ep.air_date,
            status: "wanted".into(),
            last_search_at: None,
        })
        .collect())
}
