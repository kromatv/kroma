use super::prelude::*;
use crate::services::updates;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("update.install"),
    category: Category::Maintenance,
    schedule: Some("*/10 * * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    match updates::install_automatically(&ctx.state)? {
        Some(_) => ctx.info("automatic update prepared; progress is available in Server updates"),
        None => ctx.info("no automatic update is ready, or the server is in use"),
    }
    Ok(())
}
