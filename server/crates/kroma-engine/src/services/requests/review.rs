use anyhow::{anyhow, bail, Result};

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{MediaRequest, RequestStatus};
use crate::services::jobs::now_ms;

use super::availability::match_one;
use super::notify::{notify_transition, publish};
use super::wanted::materialize_wanted;

#[cfg(test)]
mod tests;

pub fn approve_request<S: HostStorage>(state: &S, id: &str, reviewer: Option<&str>) -> Result<MediaRequest> {
    let conn = state.db().get()?;
    let req = db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request not found"))?;
    drop(conn);
    if matches!(req.status, RequestStatus::Denied) {
        bail!("request was denied; delete it and ask again");
    }
    db::set_request_status(state.db(), id, RequestStatus::Approved, reviewer, None, now_ms())?;
    materialize_wanted(state, id)?;
    let status = match_one(state, id)?.unwrap_or(RequestStatus::Approved);
    publish(state, id, status);
    notify_transition(state, id, status);
    // A no-op until the downloads milestone registers this job key.
    state.trigger_job("acquisition.search", "request-approved");
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after approve"))
}

pub fn deny_request<S: HostStorage>(state: &S, id: &str, reviewer: &str, note: Option<&str>) -> Result<MediaRequest> {
    let changed =
        db::set_request_status(state.db(), id, RequestStatus::Denied, Some(reviewer), note, now_ms())?;
    if !changed {
        bail!("request not found");
    }
    publish(state, id, RequestStatus::Denied);
    notify_transition(state, id, RequestStatus::Denied);
    let conn = state.db().get()?;
    db::get_request(&conn, id)?.ok_or_else(|| anyhow!("request vanished after deny"))
}
