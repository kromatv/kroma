//! `people.match` asks TMDB who each person written for a title is, for
//! their page and their portrait.

use super::prelude::*;
use crate::services::people_found::{match_written, JOB};

pub(super) const SPEC: Builtin = Builtin {
    key: JOB,
    category: Category::Library,
    schedule: Some("20 4 * * *"),
    triggers: &[
        Trigger::AfterJob(JobKey("library.scan")),
        Trigger::AfterJob(JobKey("pipeline.metadata")),
    ],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let pass = match_written(&ctx.state, &|| ctx.cancelled())?;
    ctx.info(format!(
        "asked TMDB about {} people, found {}",
        pass.asked, pass.found
    ));
    Ok(())
}
