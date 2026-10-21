//! One-off work an upgrade owes the data directory that a schema step cannot
//! do in its transaction: moving files, rewriting a cache on disk, anything a
//! rollback could not undo. Each task runs once, in the background after boot,
//! and is retried at the next boot until it succeeds.

use anyhow::Result;

use crate::db;
use crate::state::SharedState;

/// One task. `run` must be idempotent and able to resume: a task interrupted
/// by a crash or a stop runs again from the start at the next boot.
pub struct UpgradeTask {
    pub name: &'static str,
    pub run: fn(&SharedState) -> Result<()>,
}

/// Every task, oldest first. A task that has shipped keeps its name forever:
/// the ledger knows it by that name.
pub const TASKS: &[UpgradeTask] = &[];

/// Runs every task in `tasks` the ledger has not seen finish, in order. A
/// failure is logged and recorded, and the next task still runs.
pub fn run_pending(state: &SharedState, tasks: &[UpgradeTask]) -> Result<()> {
    let finished = db::upgrade_tasks::finished(&state.db)?;
    for task in tasks.iter().filter(|t| !finished.contains(t.name)) {
        match (task.run)(state) {
            Ok(()) => {
                db::upgrade_tasks::record_done(&state.db, task.name, kroma_primitives::now_ms())?;
                tracing::info!(task = task.name, "upgrade task finished");
            }
            Err(e) => {
                db::upgrade_tasks::record_failure(&state.db, task.name, &format!("{e:#}"))?;
                tracing::warn!(
                    task = task.name,
                    "upgrade task failed, retried at the next boot: {e:#}"
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
