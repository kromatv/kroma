use std::collections::HashSet;

use anyhow::Result;

use kroma_module_host::HostStorage;

use crate::db;
use crate::model::RequestKind;
use crate::services::jobs::now_ms;

// A file imported a moment ago may not be matched to its title yet: the scan
// and the metadata stage run after the import. A row only goes back to
// missing once it has stayed unmatched this long.
const REVERT_GRACE_MS: i64 = 12 * 60 * 60 * 1000;

// More rows vanishing in one pass than this is a source going offline, not an
// admin deleting files, and re-downloading a library is the one thing worse.
const REVERT_FLOOR: usize = 20;

/// What a reconcile pass changed.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ReconcileSummary {
    pub titles: usize,
    pub available: usize,
    pub missing_again: usize,
    pub held_back: usize,
}

#[derive(Debug, Default)]
struct Plan {
    available: Vec<String>,
    present: Vec<String>,
    missing: Vec<String>,
    held: usize,
}

/// Brings every monitored row in line with the library: a unit that is on disk
/// is available, and one whose file is gone is missing again so it gets
/// searched. When more files vanish at once than a person deletes, nothing is
/// put back to missing and the pass says how many it held back.
pub fn reconcile_pass<S: HostStorage>(state: &S) -> Result<ReconcileSummary> {
    let conn = state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let mut plan = Plan::default();
    for title in &titles {
        plan_title(state, title.kind, title.tmdb_id, &mut plan)?;
    }
    let mut summary = ReconcileSummary {
        titles: titles.len(),
        ..ReconcileSummary::default()
    };
    apply(state, &mut plan, &mut summary)?;
    Ok(summary)
}

/// [`reconcile_pass`] for one title, after it was monitored or changed.
pub(crate) fn reconcile_title<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
) -> Result<()> {
    let mut plan = Plan::default();
    plan_title(state, kind, tmdb_id, &mut plan)?;
    apply(state, &mut plan, &mut ReconcileSummary::default())
}

fn hold_back_a_mass_vanish(plan: &mut Plan, summary: &mut ReconcileSummary) {
    if plan.missing.len() <= REVERT_FLOOR.max(plan.held / 10) {
        return;
    }
    tracing::warn!(
        target: "monitoring",
        vanished = plan.missing.len(),
        "more monitored files vanished at once than an admin deletes; leaving them available"
    );
    summary.held_back = plan.missing.len();
    plan.missing.clear();
}

fn apply<S: HostStorage>(state: &S, plan: &mut Plan, summary: &mut ReconcileSummary) -> Result<()> {
    hold_back_a_mass_vanish(plan, summary);
    let now = now_ms();
    db::set_wanted_status(state.db(), &plan.available, "available", now)?;
    db::clear_wanted_vanished(state.db(), &plan.present)?;
    db::mark_wanted_vanished(state.db(), &plan.missing, now)?;
    let conn = state.db().get()?;
    let settled = db::wanted_vanished_before(&conn, &plan.missing, now - REVERT_GRACE_MS)?;
    drop(conn);
    db::set_wanted_status(state.db(), &settled, "wanted", now)?;
    db::reset_wanted_search(state.db(), &settled, now)?;
    summary.available += plan.available.len();
    summary.missing_again += settled.len();
    Ok(())
}

fn plan_title<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    plan: &mut Plan,
) -> Result<()> {
    let conn = state.db().get()?;
    let rows = db::wanted_for_title(&conn, kind, tmdb_id)?;
    let on_disk: Option<HashSet<(u32, u32)>> = match kind {
        RequestKind::Movie => (db::movie_item_by_tmdb(&conn, tmdb_id)?.is_some()
            || db::acquired_file_present(&conn, tmdb_id)?)
        .then(|| [(0, 0)].into()),
        RequestKind::Show => match db::show_by_tmdb(&conn, tmdb_id)? {
            Some(show_id) => Some(db::episodes_present(&conn, &show_id)?.into_iter().collect()),
            None => None,
        },
    };
    drop(conn);
    for row in rows {
        let unit = (row.season.unwrap_or(0), row.episode.unwrap_or(0));
        let held = on_disk.as_ref().is_some_and(|disk| disk.contains(&unit));
        match (held, row.status.as_str()) {
            (true, "available") => {
                plan.held += 1;
                plan.present.push(row.id);
            }
            (true, _) => plan.available.push(row.id),
            (false, "available") if gone(kind, on_disk.as_ref()) => plan.missing.push(row.id),
            (false, "available") => plan.held += 1,
            _ => {}
        }
    }
    Ok(())
}

// A show the catalog no longer knows at all is a source gone dark as often as
// a show deleted, so only an episode missing from a show still on disk counts.
fn gone(kind: RequestKind, on_disk: Option<&HashSet<(u32, u32)>>) -> bool {
    match kind {
        RequestKind::Movie => true,
        RequestKind::Show => on_disk.is_some(),
    }
}
