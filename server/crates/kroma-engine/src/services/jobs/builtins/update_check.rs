use super::prelude::*;

use crate::services::updates;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("update.check"),
    category: Category::Maintenance,
    schedule: Some("23 */6 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    if !ctx.state.settings.get_bool(updates::AUTO_KEY, true) {
        ctx.info("update checks are off");
        return Ok(());
    }
    let status = updates::check(&ctx.state)?;
    match (&status.latest, &status.error) {
        (_, Some(error)) => ctx.info(format!("the release feed did not answer: {error}")),
        (Some(latest), None) if status.available => {
            ctx.info(format!("{} is available", latest.version))
        }
        _ => ctx.info(format!("{} is current", status.version)),
    }
    Ok(())
}
