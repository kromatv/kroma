use std::collections::BTreeSet;

use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{RequestKind, RequestStatus};
use crate::services::jobs::now_ms;

use super::notify::{notify_requester, publish, request_link};

/// What one finished import put on disk, as its download describes it: a
/// movie, one season pack, or some episodes of a season.
#[derive(Debug, Clone, Copy)]
pub struct Imported<'a> {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub season: Option<u32>,
    pub episodes: Option<&'a [u32]>,
    pub request_id: Option<&'a str>,
}

/// Marks the units an import put on disk available, and settles the requests
/// they answer to, without waiting for the scan -> enrich -> match chain
/// (enrichment may not recover the id).
pub fn on_download_imported<S: HostStorage>(state: &S, imported: &Imported) -> Result<()> {
    let conn = state.db().get()?;
    let rows = db::wanted_for_title(&conn, imported.kind, imported.tmdb_id)?;
    drop(conn);
    let covered: Vec<&db::WantedRow> = rows.iter().filter(|w| covers(imported, w)).collect();
    let flipped: Vec<String> = covered
        .iter()
        .filter(|w| w.status != "available")
        .map(|w| w.id.clone())
        .collect();
    db::set_wanted_status(state.db(), &flipped, "available", now_ms())?;
    let requests: BTreeSet<&str> = covered
        .iter()
        .filter_map(|w| w.request_id.as_deref())
        .chain(imported.request_id)
        .collect();
    for request_id in requests {
        settle_request(state, request_id)?;
    }
    Ok(())
}

fn covers(imported: &Imported, row: &db::WantedRow) -> bool {
    if imported.kind == RequestKind::Movie {
        return true;
    }
    row.season.is_some()
        && row.season == imported.season
        && imported
            .episodes
            .is_none_or(|episodes| row.episode.is_some_and(|e| episodes.contains(&e)))
}

fn settle_request<S: HostStorage>(state: &S, request_id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, request_id)? else {
        return Ok(());
    };
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let status = if wanted.is_empty() || wanted.iter().all(|w| w.status == "available") {
        RequestStatus::Available
    } else if wanted.iter().any(|w| w.status == "available") {
        RequestStatus::PartiallyAvailable
    } else {
        return Ok(());
    };
    if req.status != status {
        db::set_request_status(state.db(), request_id, status, None, None, now_ms())?;
        publish(state, request_id, status);
        let link = request_link(state, &req);
        notify_requester(state, &req, status, &link);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::requests::test_fixtures::wanted;
    use crate::services::requests::test_support::{insert_req, status_of_req, test_host};

    fn movie(request_id: Option<&str>) -> Imported<'_> {
        Imported {
            kind: RequestKind::Movie,
            tmdb_id: 100,
            season: None,
            episodes: None,
            request_id,
        }
    }

    fn status(host: &crate::services::requests::test_support::TestHost, id: &str) -> String {
        let conn = host.db().get().unwrap();
        db::wanted_for_title(&conn, RequestKind::Show, 100)
            .unwrap()
            .into_iter()
            .chain(db::wanted_for_title(&conn, RequestKind::Movie, 100).unwrap())
            .find(|w| w.id == id)
            .unwrap()
            .status
    }

    #[test]
    fn an_imported_movie_is_available_and_settles_its_request() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 100, RequestStatus::Approved);
        db::claim_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "grabbed")],
            now_ms(),
        )
        .unwrap();

        on_download_imported(&host, &movie(Some("r1"))).unwrap();

        assert_eq!(status(&host, "w1"), "available");
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(!host.published().is_empty());
    }

    #[test]
    fn an_import_for_a_title_nothing_monitors_changes_nothing() {
        let host = test_host();

        on_download_imported(&host, &movie(Some("ghost"))).unwrap();

        assert!(host.published().is_empty());
    }

    #[test]
    fn an_episode_import_flips_only_the_episodes_it_held() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Show, 100, RequestStatus::Approved);
        db::claim_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "grabbed"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "grabbed"),
            ],
            now_ms(),
        )
        .unwrap();

        on_download_imported(
            &host,
            &Imported {
                kind: RequestKind::Show,
                tmdb_id: 100,
                season: Some(1),
                episodes: Some(&[1]),
                request_id: Some("r1"),
            },
        )
        .unwrap();

        assert_eq!(status(&host, "w1"), "available");
        assert_eq!(status(&host, "w2"), "grabbed");
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::PartiallyAvailable);
    }

    #[test]
    fn a_season_pack_flips_the_whole_season() {
        let host = test_host();
        db::insert_wanted(
            host.db(),
            &[
                db::WantedRow {
                    request_id: None,
                    ..wanted("w1", "-", Some(2), Some(1), None, "grabbed")
                },
                db::WantedRow {
                    request_id: None,
                    ..wanted("w2", "-", Some(2), Some(2), None, "wanted")
                },
                db::WantedRow {
                    request_id: None,
                    ..wanted("w3", "-", Some(3), Some(1), None, "wanted")
                },
            ],
            now_ms(),
        )
        .unwrap();

        on_download_imported(
            &host,
            &Imported {
                kind: RequestKind::Show,
                tmdb_id: 100,
                season: Some(2),
                episodes: None,
                request_id: None,
            },
        )
        .unwrap();

        assert_eq!(status(&host, "w1"), "available");
        assert_eq!(status(&host, "w2"), "available");
        assert_eq!(status(&host, "w3"), "wanted");
    }

    #[test]
    fn an_import_that_changes_nothing_notifies_nobody() {
        let host = test_host();
        insert_req(&host, "r1", RequestKind::Movie, 100, RequestStatus::Available);
        db::claim_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "available")],
            now_ms(),
        )
        .unwrap();

        on_download_imported(&host, &movie(Some("r1"))).unwrap();

        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(host.notifications().is_empty());
    }
}
