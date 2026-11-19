//! Imports, the core's own work. One import of another media server runs as the
//! `household.import` job: it reads the importer page by page, hands each row
//! to the stage that brings its kind over, and records what was brought, so a
//! later import of the same server brings only what changed.
//!
//! The job takes no parameter. Its input is the import's own row, queued by
//! [`start`], and one import runs at a time.

mod halt;
mod kept;
mod passage;
mod passes;
mod paths;
mod pull;
mod review;
mod run;
mod settle;
#[expect(
    dead_code,
    reason = "the titles and plays stages read nothing of what they are given yet"
)]
mod stages;
mod start;

#[cfg(test)]
mod tests;

pub use review::{FoldersAsk, folders_here};
pub(crate) use run::run;
pub use start::{Request, StartError, Started, start};

use crate::services::jobs::JobKey;

pub const JOB: JobKey = JobKey("household.import");
