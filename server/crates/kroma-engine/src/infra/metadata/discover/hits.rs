use crate::model::RequestKind;

use super::super::client::{IMG, api, curl_json};
use super::wire::{PageResp, RawHit};
use super::{DiscoverHit, DiscoverPage, DiscoverScope, year_of};

/// Search TMDB. `All` uses multi-search (drops `person` hits); the scoped
/// variants hit the movie/tv endpoints directly.
// The `()` Err is the unit error threaded up from `curl_json` via `?`; callers only
// care ok/err, so a richer error type would add nothing here.
#[allow(clippy::result_unit_err)]
pub fn search(
    api_key: &str,
    language: &str,
    scope: DiscoverScope,
    query: &str,
    page: u32,
) -> Result<DiscoverPage, ()> {
    let params = vec![
        ("language", language.to_string()),
        ("query", query.to_string()),
        ("include_adult", "false".to_string()),
        ("page", page.max(1).to_string()),
    ];
    let path = match scope {
        DiscoverScope::Movies => "search/movie",
        DiscoverScope::Shows => "search/tv",
        DiscoverScope::All => "search/multi",
    };
    let resp: PageResp = curl_json(&format!("{}/{path}", api()), api_key, &params)?;
    Ok(map_page(resp, scope))
}

/// This week's trending titles. `All` (movies + shows, page 1) powers the
/// discover empty-state rails; the scoped variants back the full "trending
/// movies" / "trending shows" pages with real pagination.
// The `()` Err is the unit error threaded up from `curl_json` via `?`; callers only
// care ok/err, so a richer error type would add nothing here.
#[allow(clippy::result_unit_err)]
pub fn trending(
    api_key: &str,
    language: &str,
    scope: DiscoverScope,
    page: u32,
) -> Result<DiscoverPage, ()> {
    let path = match scope {
        DiscoverScope::Movies => "trending/movie/week",
        DiscoverScope::Shows => "trending/tv/week",
        DiscoverScope::All => "trending/all/week",
    };
    let params = vec![
        ("language", language.to_string()),
        ("page", page.max(1).to_string()),
    ];
    let resp: PageResp = curl_json(&format!("{}/{path}", api()), api_key, &params)?;
    Ok(map_page(resp, scope))
}

// Skips rows with no usable title.
pub(super) fn hit_from(kind: RequestKind, h: RawHit) -> Option<DiscoverHit> {
    let title = h.title.or(h.name)?;
    Some(DiscoverHit {
        kind,
        tmdb_id: h.id,
        title,
        original_title: h.original_title.or(h.original_name).unwrap_or_default(),
        year: year_of(h.release_date.as_deref().or(h.first_air_date.as_deref())),
        poster_url: h.poster_path.map(|p| format!("{IMG}/w342{p}")),
        backdrop_url: h.backdrop_path.map(|p| format!("{IMG}/w780{p}")),
        overview: h.overview.filter(|s| !s.is_empty()),
        rating: h.vote_average.filter(|v| *v > 0.0),
    })
}

fn map_page(resp: PageResp, scope: DiscoverScope) -> DiscoverPage {
    let hits = resp
        .results
        .into_iter()
        .filter_map(|h| {
            // Multi-search mixes movies, shows and people; scoped searches carry
            // no media_type (the endpoint implies it).
            let kind = match h.media_type.as_deref() {
                Some("movie") => RequestKind::Movie,
                Some("tv") => RequestKind::Show,
                Some(_) => return None, // person / collection
                None => match scope {
                    DiscoverScope::Movies => RequestKind::Movie,
                    DiscoverScope::Shows => RequestKind::Show,
                    DiscoverScope::All => return None,
                },
            };
            hit_from(kind, h)
        })
        .collect();
    DiscoverPage {
        hits,
        page: resp.page.max(1),
        total_pages: resp.total_pages.max(1),
    }
}
