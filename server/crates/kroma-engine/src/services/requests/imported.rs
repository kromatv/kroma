use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::RequestStatus;
use crate::services::jobs::now_ms;

use super::notify::{notify_requester, publish, request_link};

/// Fulfill a request from a completed import, without waiting for the
/// scan -> enrich -> match-by-tmdbId chain (enrichment may not recover the id).
pub fn on_download_imported<S: HostStorage>(state: &S, request_id: &str) -> Result<()> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, request_id)? else {
        return Ok(());
    };
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);
    let grabbed: Vec<String> = wanted
        .iter()
        .filter(|w| w.status == "grabbed")
        .map(|w| w.id.clone())
        .collect();
    if !grabbed.is_empty() {
        db::set_wanted_status(state.db(), &grabbed, "available", now_ms())?;
    }
    let conn = state.db().get()?;
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
    use crate::model::RequestKind;
    use crate::services::requests::test_fixtures::wanted;
    use crate::services::requests::test_support::{insert_req, status_of_req, test_host};

    #[test]
    fn on_download_imported_flips_grabbed_rows_to_available() {
        let host = test_host();
        insert_req(
            &host,
            "r1",
            RequestKind::Movie,
            603,
            RequestStatus::Approved,
        );
        db::replace_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "grabbed")],
            now_ms(),
        )
        .unwrap();

        on_download_imported(&host, "r1").unwrap();
        let conn = host.db().get().unwrap();
        assert_eq!(
            db::wanted_for_request(&conn, "r1").unwrap()[0].status,
            "available"
        );
        drop(conn);
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(
            host.published().len() >= 1,
            "an available flip publishes an update"
        );
    }

    #[test]
    fn on_download_imported_unknown_request_is_noop() {
        let host = test_host();
        on_download_imported(&host, "ghost").unwrap();
        assert_eq!(host.published().len(), 0);
    }

    #[test]
    fn on_download_imported_show_partial_when_some_still_wanted() {
        let host = test_host();
        insert_req(
            &host,
            "r1",
            RequestKind::Show,
            1396,
            RequestStatus::Approved,
        );
        db::replace_wanted(
            host.db(),
            "r1",
            &[
                wanted("w1", "r1", Some(1), Some(1), Some("2020-01-01"), "grabbed"),
                wanted("w2", "r1", Some(1), Some(2), Some("2020-01-02"), "wanted"),
            ],
            now_ms(),
        )
        .unwrap();
        on_download_imported(&host, "r1").unwrap();
        assert_eq!(
            status_of_req(&host, "r1"),
            RequestStatus::PartiallyAvailable
        );
        let conn = host.db().get().unwrap();
        let rows = db::wanted_for_request(&conn, "r1").unwrap();
        assert_eq!(rows.iter().filter(|w| w.status == "available").count(), 1);
    }

    #[test]
    fn on_download_imported_no_grabbed_rows_is_noop() {
        let host = test_host();
        insert_req(
            &host,
            "r1",
            RequestKind::Movie,
            603,
            RequestStatus::Approved,
        );
        db::replace_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "wanted")],
            now_ms(),
        )
        .unwrap();
        on_download_imported(&host, "r1").unwrap();
        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Approved);
        assert_eq!(host.published().len(), 0);
    }

    #[test]
    fn an_import_that_changes_nothing_notifies_nobody() {
        let host = test_host();
        insert_req(
            &host,
            "r1",
            RequestKind::Movie,
            603,
            RequestStatus::Available,
        );
        db::replace_wanted(
            host.db(),
            "r1",
            &[wanted("w1", "r1", None, None, None, "available")],
            now_ms(),
        )
        .unwrap();

        on_download_imported(&host, "r1").unwrap();

        assert_eq!(status_of_req(&host, "r1"), RequestStatus::Available);
        assert!(
            host.notifications().is_empty(),
            "the reader was already told"
        );
    }
}
