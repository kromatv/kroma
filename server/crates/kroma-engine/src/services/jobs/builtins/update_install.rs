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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_scheduled_installer_does_nothing_without_explicit_opt_in() {
        let state = crate::test_support::test_state();
        run(&JobContext::for_test(state.clone())).unwrap();
        assert!(updates::status(&state).operation.is_none());
    }
}
