use anyhow::{anyhow, bail, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::infra::metadata::discover;
use crate::model::{EpisodeRef, MediaRequest, RequestKind};
use crate::services::jobs::now_ms;

use super::{language, tmdb_key};

pub(super) fn normalize_episodes(episodes: Option<Vec<EpisodeRef>>) -> Option<Vec<EpisodeRef>> {
    let mut list = episodes.filter(|e| !e.is_empty())?;
    list.sort_unstable_by_key(|e| (e.season, e.episode));
    list.dedup();
    Some(list)
}

fn is_whole_show(seasons: &Option<Vec<u32>>, episodes: &Option<Vec<EpisodeRef>>) -> bool {
    seasons.is_none() && episodes.is_none()
}

// Union of two Show targets. A whole-show side absorbs everything; otherwise a
// `None` set means the EMPTY set, not "all", so a narrow ask never shrinks a
// broader request.
pub(super) fn merge_target(
    ex_seasons: Option<Vec<u32>>,
    ex_episodes: Option<Vec<EpisodeRef>>,
    add_seasons: Option<Vec<u32>>,
    add_episodes: Option<Vec<EpisodeRef>>,
) -> (Option<Vec<u32>>, Option<Vec<EpisodeRef>>) {
    if is_whole_show(&ex_seasons, &ex_episodes) || is_whole_show(&add_seasons, &add_episodes) {
        return (None, None);
    }
    let mut seasons: Vec<u32> = ex_seasons
        .unwrap_or_default()
        .into_iter()
        .chain(add_seasons.unwrap_or_default())
        .collect();
    let seasons = if seasons.is_empty() {
        None
    } else {
        seasons.sort_unstable();
        seasons.dedup();
        Some(seasons)
    };
    let episodes: Vec<EpisodeRef> = ex_episodes
        .unwrap_or_default()
        .into_iter()
        .chain(add_episodes.unwrap_or_default())
        .collect();
    (seasons, normalize_episodes(Some(episodes)))
}

pub(super) fn materialize_wanted<S: HostStorage>(state: &S, id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    let rows = build_wanted_rows(state, &req)?;
    db::replace_wanted(state.db(), &req.id, &rows, now_ms())
}

/// The wanted rows a request WOULD get on approval, persisting nothing.
pub fn preview_wanted<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    out: &mut Vec<db::WantedRow>,
) -> Result<()> {
    *out = build_wanted_rows(state, req)?;
    Ok(())
}

pub(super) fn build_wanted_rows<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
) -> Result<Vec<db::WantedRow>> {
    let key = tmdb_key(state)?;
    let lang = language(state);
    let detail = discover::detail(&key, &lang, req.kind, req.tmdb_id)
        .map_err(|()| anyhow!("TMDB lookup failed"))?
        .ok_or_else(|| anyhow!("title not found on TMDB"))?;
    build_wanted_rows_from(state, req, &detail)
}

pub(super) fn build_wanted_rows_from<S: HostStorage>(
    state: &S,
    req: &MediaRequest,
    detail: &discover::DiscoverRawDetail,
) -> Result<Vec<db::WantedRow>> {
    let key = tmdb_key(state)?;
    let lang = language(state);

    let mut rows: Vec<db::WantedRow> = Vec::new();
    let mint = |salt: &str| {
        crate::services::scan::short_hash(&format!("wanted|{}|{}|{salt}", req.id, req.tmdb_id))
    };
    match req.kind {
        RequestKind::Movie => rows.push(db::WantedRow {
            id: mint("movie"),
            request_id: req.id.clone(),
            kind: "movie".into(),
            tmdb_id: req.tmdb_id,
            imdb_id: detail.imdb_id.clone(),
            title: req.title.clone(),
            year: req.year,
            season: None,
            episode: None,
            // The soonest availability date (digital > theatrical > release) gates an
            // unreleased movie out of search (wanted_searchable: air_date NULL or <= today).
            air_date: detail.available_date.clone(),
            status: "wanted".into(),
            last_search_at: None,
        }),
        RequestKind::Show => {
            use std::collections::{BTreeSet, HashSet};
            let full_seasons: HashSet<u32> = match (&req.seasons, &req.episodes) {
                (Some(list), _) => list.iter().copied().collect(),
                (None, None) => detail.seasons.iter().map(|s| s.season).collect(),
                (None, Some(_)) => HashSet::new(),
            };
            let individual: HashSet<(u32, u32)> = req
                .episodes
                .as_ref()
                .map(|eps| eps.iter().map(|e| (e.season, e.episode)).collect())
                .unwrap_or_default();
            let needed: BTreeSet<u32> = full_seasons
                .iter()
                .copied()
                .chain(individual.iter().map(|(s, _)| *s))
                .collect();
            for season in needed {
                let want_whole = full_seasons.contains(&season);
                let data =
                    crate::infra::metadata::season_episodes(&key, &lang, req.tmdb_id, season);
                for ep in data.episodes {
                    if !want_whole && !individual.contains(&(season, ep.episode)) {
                        continue;
                    }
                    rows.push(db::WantedRow {
                        id: mint(&format!("s{season:02}e{:03}", ep.episode)),
                        request_id: req.id.clone(),
                        kind: "episode".into(),
                        tmdb_id: req.tmdb_id,
                        imdb_id: detail.imdb_id.clone(),
                        title: req.title.clone(),
                        year: req.year,
                        season: Some(season),
                        episode: Some(ep.episode),
                        air_date: ep.air_date.clone(),
                        status: "wanted".into(),
                        last_search_at: None,
                    });
                }
            }
            if rows.is_empty() {
                bail!("TMDB lists no episodes for the requested seasons");
            }
        }
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::RequestStatus;
    use crate::services::requests::test_fixtures::{ep, movie_detail, raw_detail, req, wanted};
    use crate::services::requests::test_support::{insert_req, test_host};
    use crate::test_support::FakeTmdb;

    #[test]
    fn merge_target_whole_show_absorbs_any_ask() {
        assert_eq!(
            merge_target(None, None, None, Some(vec![ep(1, 3)])),
            (None, None)
        );
        assert_eq!(merge_target(None, None, Some(vec![2]), None), (None, None));
        assert_eq!(merge_target(Some(vec![1]), None, None, None), (None, None));
    }

    #[test]
    fn merge_target_unions_seasons_and_episodes() {
        assert_eq!(
            merge_target(Some(vec![1]), None, Some(vec![2, 1]), None),
            (Some(vec![1, 2]), None)
        );
        assert_eq!(
            merge_target(None, Some(vec![ep(1, 3)]), None, Some(vec![ep(1, 4)])),
            (None, Some(vec![ep(1, 3), ep(1, 4)]))
        );
        assert_eq!(
            merge_target(Some(vec![2]), None, None, Some(vec![ep(1, 5)])),
            (Some(vec![2]), Some(vec![ep(1, 5)]))
        );
        assert_eq!(
            merge_target(None, Some(vec![ep(1, 3)]), None, Some(vec![ep(1, 3)])),
            (None, Some(vec![ep(1, 3)]))
        );
    }

    #[test]
    fn normalize_episodes_empty_is_none() {
        assert_eq!(normalize_episodes(Some(vec![])), None);
        assert_eq!(normalize_episodes(None), None);
        assert_eq!(
            normalize_episodes(Some(vec![ep(2, 1), ep(1, 2), ep(1, 2)])),
            Some(vec![ep(1, 2), ep(2, 1)])
        );
    }

    #[test]
    fn is_whole_show_only_when_both_unset() {
        assert!(is_whole_show(&None, &None));
        assert!(!is_whole_show(&Some(vec![1]), &None));
        assert!(!is_whole_show(&None, &Some(vec![ep(1, 1)])));
        assert!(!is_whole_show(&Some(vec![1]), &Some(vec![ep(1, 1)])));
    }

    #[test]
    fn build_wanted_rows_from_movie_makes_one_row_with_release_gate() {
        let host = test_host();
        let request = req(RequestKind::Movie, RequestStatus::Approved);
        let detail = raw_detail(Some("tt0133093"), Some("2020-01-01"));
        let rows = build_wanted_rows_from(&host, &request, &detail).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "movie");
        assert_eq!(rows[0].tmdb_id, request.tmdb_id);
        assert_eq!(rows[0].imdb_id.as_deref(), Some("tt0133093"));
        assert_eq!(rows[0].air_date.as_deref(), Some("2020-01-01"));
        assert_eq!(rows[0].status, "wanted");
    }

    #[test]
    fn build_wanted_rows_from_show_with_empty_seasons_bails() {
        let host = test_host();
        let mut request = req(RequestKind::Show, RequestStatus::Approved);
        request.seasons = Some(Vec::new());
        let detail = raw_detail(None, None);
        assert!(build_wanted_rows_from(&host, &request, &detail).is_err());
    }

    #[test]
    fn a_preview_reports_the_rows_an_approval_would_write_without_writing_them() {
        let host = test_host();
        let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
        insert_req(
            &host,
            "r-1",
            RequestKind::Movie,
            603,
            RequestStatus::Pending,
        );
        let conn = host.db().get().unwrap();
        let req = db::get_request(&conn, "r-1").unwrap().unwrap();
        drop(conn);

        let mut out = vec![wanted("stale", "r-1", None, None, None, "wanted")];
        preview_wanted(&host, &req, &mut out).unwrap();

        assert_eq!(
            out.len(),
            1,
            "the caller's buffer is replaced, not appended to"
        );
        assert_eq!(out[0].kind, "movie");
        assert_eq!(out[0].imdb_id.as_deref(), Some("tt0000001"));
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r-1").unwrap().is_empty());
    }
}
