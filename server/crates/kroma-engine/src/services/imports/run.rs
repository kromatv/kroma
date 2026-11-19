//! The body of the import job: it takes the import that waits, runs it, and
//! ends it as completed, cancelled or failed. Whatever it brought stays.

use anyhow::{Result, anyhow};

use super::halt::Halt;
use super::passage::Passage;
use super::stages::{Core, Stages};
use crate::db;
use crate::db::imports::Ending;
use crate::model::imports::{Import, Report, Status};
use crate::services::importers::Unanswered;
use crate::services::jobs::{JobContext, now_ms};

const IMPORTS_KEPT: usize = 50;

/// Runs the queued import, if there is one, with the core's own stages.
pub(crate) fn run(ctx: &JobContext) -> Result<()> {
    run_with(ctx, &Core)
}

pub(crate) fn run_with(ctx: &JobContext, stages: &dyn Stages) -> Result<()> {
    let Some(import) = db::imports::claim(&ctx.state.db, ctx.run_id(), now_ms())? else {
        ctx.info("no import is waiting to run");
        return Ok(());
    };
    let mut passage = Passage::new(ctx, stages, &import);
    let halted = passage.bring_over().and_then(|()| passage.alive()).err();
    end(ctx, &import, &passage.report, halted)
}

fn end(ctx: &JobContext, import: &Import, report: &Report, halted: Option<Halt>) -> Result<()> {
    let failure = halted.as_ref().and_then(Halt::failure);
    let status = match &halted {
        None => Status::Completed,
        Some(Halt::Cancelled) => Status::Cancelled,
        Some(_) => Status::Failed,
    };
    let ending = Ending {
        status,
        failure: failure.as_ref(),
        report,
        finished_ms: now_ms(),
    };
    db::imports::finish(&ctx.state.db, &import.id, &ending)?;
    db::imports::prune(&ctx.state.db, IMPORTS_KEPT)?;
    ctx.info(summary(status, report));
    match halted {
        None | Some(Halt::Cancelled) => Ok(()),
        Some(halt) => Err(failed(halt)),
    }
}

fn failed(halt: Halt) -> anyhow::Error {
    if let Halt::Importer(Unanswered::Unreadable(detail)) = &halt {
        tracing::warn!(%detail, "an importer's answer could not be used");
    }
    match halt {
        Halt::Internal(error) => error,
        other => anyhow!("{other}"),
    }
}

fn summary(status: Status, report: &Report) -> String {
    format!(
        "import {}: brought {} libraries, {} users, {} titles, {} watch states and {} plays",
        status.as_str(),
        report.libraries.brought,
        report.users.brought,
        report.titles.brought,
        report.states.brought,
        report.plays.brought
    )
}
