use anyhow::{anyhow, bail, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{EpisodeRef, MediaRequest, RequestKind, RequestStatus};
use crate::services::jobs::now_ms;

use super::availability::match_one;
use super::notify::publish;
use super::wanted::{build_wanted_rows, normalize_episodes};

/// Set exactly what a show request covers: the whole show (`None`/`None`), some
/// seasons, some episodes, or a mix. Unlike the merge a second ask performs,
/// this can NARROW as well as widen -- it is the admin saying what is wanted,
/// not another viewer adding to it.
///
/// The ledger is reconciled rather than rebuilt, so an episode that stays in
/// scope keeps whatever state it had: rebuilding it would forget that a download
/// is queued or that the file is already on disk. What comes out of it is what
/// the automatic search pass works from, so this is also how an admin says what
/// the job should be hunting.
pub fn set_coverage<S: HostStorage>(
    state: &S,
    id: &str,
    seasons: Option<Vec<u32>>,
    episodes: Option<Vec<EpisodeRef>>,
) -> Result<MediaRequest> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    if req.kind != RequestKind::Show {
        bail!("a movie request covers one film; there is nothing to scope");
    }
    if matches!(req.status, RequestStatus::Denied) {
        bail!("request was denied; delete it and ask again");
    }
    let seasons = seasons.filter(|s| !s.is_empty()).map(|mut s| {
        s.sort_unstable();
        s.dedup();
        s
    });
    let episodes = normalize_episodes(episodes);
    db::set_request_seasons(state.db(), id, seasons.as_deref(), now_ms())?;
    db::set_request_episodes(state.db(), id, episodes.as_deref(), now_ms())?;

    // A pending request has no ledger yet; approving it builds one from the
    // coverage just set, so there is nothing to reconcile until then.
    let status = if matches!(req.status, RequestStatus::Pending) {
        req.status
    } else {
        reconcile_wanted(state, id)?;
        match_one(state, id)?.unwrap_or(req.status)
    };
    publish(state, id, status);
    state.trigger_job("acquisition.search", "request-coverage");
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after coverage change"))
}

/// Bring the ledger in line with what the request now covers, KEEPING the state
/// of every row that survives. `insert_wanted` ignores rows already there and
/// `prune_wanted` drops the ones that fell out of scope; between them nothing
/// that was grabbed or is on disk is forgotten.
fn reconcile_wanted<S: HostStorage>(state: &S, id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    let rows = build_wanted_rows(state, &req)?;
    let keep: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    db::insert_wanted(state.db(), &rows, now_ms())?;
    db::prune_wanted(state.db(), id, &keep)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::requests::test_support::{host_with_tmdb, insert_req};

    #[test]
    fn coverage_is_not_a_thing_a_movie_request_has() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Movie, 7, RequestStatus::Approved);
        let err = set_coverage(&host, "r1", Some(vec![1]), None).unwrap_err();
        assert!(err.to_string().contains("nothing to scope"), "{err}");
    }

    #[test]
    fn coverage_refuses_a_denied_request() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Denied);
        assert!(set_coverage(&host, "r1", Some(vec![1]), None)
            .unwrap_err()
            .to_string()
            .contains("denied"));
    }

    #[test]
    fn coverage_on_a_pending_request_only_records_the_target() {
        // Nothing to reconcile: approving is what builds the ledger, and it will
        // build it from the coverage just set.
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Pending);
        let req = set_coverage(&host, "r1", Some(vec![3, 1, 1]), None).unwrap();
        assert_eq!(req.seasons, Some(vec![1, 3]), "sorted and deduped");
        assert_eq!(
            req.status,
            RequestStatus::Pending,
            "recording a target approves nothing"
        );
        let conn = host.db().get().unwrap();
        assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
    }

    #[test]
    fn coverage_normalizes_empty_lists_to_the_whole_show() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Pending);
        let req = set_coverage(&host, "r1", Some(vec![]), Some(vec![])).unwrap();
        assert_eq!(req.seasons, None);
        assert_eq!(req.episodes, None);
    }

    #[test]
    fn narrowing_coverage_drops_the_rows_that_left_and_keeps_the_rest_as_they_were() {
        let host = host_with_tmdb(Some("k"));
        insert_req(&host, "r1", RequestKind::Show, 42, RequestStatus::Approved);
        let mk = |id: &str, season: u32, episode: u32, status: &str| db::WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: Some(season),
            episode: Some(episode),
            air_date: Some("2020-01-01".into()),
            status: status.into(),
            last_search_at: None,
        };
        db::replace_wanted(
            host.db(),
            "r1",
            &[mk("keep", 1, 1, "available"), mk("drop", 2, 1, "wanted")],
            0,
        )
        .unwrap();

        // The ids the rebuild mints are deterministic, so a row that stays in
        // scope is recognised and keeps its state rather than being re-created.
        let rows = {
            let conn = host.db().get().unwrap();
            db::wanted_for_request(&conn, "r1").unwrap()
        };
        assert_eq!(rows.len(), 2, "both there before narrowing");

        db::prune_wanted(host.db(), "r1", &["keep".into()]).unwrap();
        let conn = host.db().get().unwrap();
        let after = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(after.len(), 1);
        assert_eq!(
            after[0].status, "available",
            "the survivor did not forget its file"
        );
    }
}
