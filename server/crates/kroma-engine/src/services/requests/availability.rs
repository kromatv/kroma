use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{MediaRequest, RequestKind, RequestStatus};
use crate::services::jobs::now_ms;

use super::notify::{notify_requester, publish, request_link};
use super::today_ymd;

#[cfg(test)]
mod tests;

#[derive(Debug, Default)]
pub struct MatchSummary {
    pub checked: usize,
    pub changed: usize,
}

/// Re-derive availability for every non-terminal request.
pub fn availability_pass<S: HostStorage>(state: &S) -> Result<MatchSummary> {
    let conn = state.db().get()?;
    let all = db::list_requests(&conn, None)?;
    drop(conn);
    let mut summary = MatchSummary::default();
    for req in all {
        if matches!(req.status, RequestStatus::Denied | RequestStatus::Failed) {
            continue;
        }
        summary.checked += 1;
        if let Some(new_status) = match_one(state, &req.id)? {
            if new_status != req.status {
                summary.changed += 1;
                publish(state, &req.id, new_status);
            }
        }
    }
    Ok(summary)
}

/// Match one request against the local catalog. `None` when no judgement is
/// possible; never downgrades a request that already reached `available`.
pub fn match_one<S: HostStorage>(state: &S, id: &str) -> Result<Option<RequestStatus>> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, id)? else {
        return Ok(None);
    };
    match req.kind {
        RequestKind::Movie => match_movie(state, conn, &req),
        RequestKind::Show => match_show(state, conn, &req),
    }
}

fn match_movie<S: HostStorage>(
    state: &S,
    conn: db::PooledConn,
    req: &MediaRequest,
) -> Result<Option<RequestStatus>> {
    let Some(_item) = db::movie_item_by_tmdb(&conn, req.tmdb_id)? else {
        return Ok(None);
    };
    let wanted_ids: Vec<String> = db::wanted_for_request(&conn, &req.id)?
        .into_iter()
        .map(|w| w.id)
        .collect();
    drop(conn);
    db::set_wanted_status(state.db(), &wanted_ids, "available", now_ms())?;
    if req.status != RequestStatus::Available {
        db::set_request_status(
            state.db(),
            &req.id,
            RequestStatus::Available,
            None,
            None,
            now_ms(),
        )?;
        let link = request_link(state, req);
        notify_requester(state, req, RequestStatus::Available, &link);
    }
    Ok(Some(RequestStatus::Available))
}

fn match_show<S: HostStorage>(
    state: &S,
    conn: db::PooledConn,
    req: &MediaRequest,
) -> Result<Option<RequestStatus>> {
    let Some(show_id) = db::show_by_tmdb(&conn, req.tmdb_id)? else {
        return Ok(None);
    };
    let present: std::collections::HashSet<(u32, u32)> =
        db::episodes_present(&conn, &show_id)?.into_iter().collect();
    let wanted = db::wanted_for_request(&conn, &req.id)?;
    drop(conn);
    if wanted.is_empty() {
        return Ok(None);
    }
    let today = today_ymd();
    let (aired, have, newly_available) = tally_wanted(&wanted, &present, &today);
    db::set_wanted_status(state.db(), &newly_available, "available", now_ms())?;
    let new_status = if aired > 0 && have == aired {
        RequestStatus::Available
    } else if have > 0 {
        RequestStatus::PartiallyAvailable
    } else {
        return Ok(None);
    };
    // Never regress a fully-available request (e.g. a temporary unmount).
    if req.status == RequestStatus::Available && new_status != RequestStatus::Available {
        return Ok(Some(RequestStatus::Available));
    }
    if new_status != req.status {
        db::set_request_status(state.db(), &req.id, new_status, None, None, now_ms())?;
        let link = request_link(state, req);
        notify_requester(state, req, new_status, &link);
    }
    Ok(Some(new_status))
}

fn tally_wanted(
    wanted: &[db::WantedRow],
    present: &std::collections::HashSet<(u32, u32)>,
    today: &str,
) -> (usize, usize, Vec<String>) {
    let mut newly_available: Vec<String> = Vec::new();
    let (mut aired, mut have) = (0usize, 0usize);
    for w in wanted {
        let (Some(s), Some(e)) = (w.season, w.episode) else {
            continue;
        };
        let is_aired = w.air_date.as_deref().is_none_or(|d| d <= today);
        if !is_aired {
            continue;
        }
        aired += 1;
        if present.contains(&(s, e)) {
            have += 1;
            if w.status != "available" {
                newly_available.push(w.id.clone());
            }
        }
    }
    (aired, have, newly_available)
}
