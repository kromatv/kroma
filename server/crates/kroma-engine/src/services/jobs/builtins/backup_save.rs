//! `backup.save` saves a backup into the folder the owner chose and keeps the
//! newest few, unless scheduled backups are off. A run that cannot save fails,
//! so the job console shows why.

use super::prelude::*;

use crate::services::backup::schedule;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("backup.save"),
    category: Category::Maintenance,
    schedule: Some("0 3 * * *"),
    triggers: &[],
    run,
};

fn stamp() -> String {
    crate::services::scan::now_iso8601().replace(':', "-")
}

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    if !ctx.state.settings.get_bool(schedule::ENABLED_KEY, false) {
        ctx.info("scheduled backups are off; nothing was saved");
        return Ok(());
    }
    let saved = schedule::save(&ctx.state, &stamp())?;
    ctx.info(format!(
        "saved {} ({} bytes) and removed {} older backups",
        saved.file.display(),
        saved.bytes,
        saved.removed
    ));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    fn switched_on(state: &crate::state::SharedState, folder: &std::path::Path) {
        state.settings.set_patch(
            &state.db,
            [
                (schedule::ENABLED_KEY.to_string(), serde_json::json!(true)),
                (
                    schedule::FOLDER_KEY.to_string(),
                    serde_json::json!(folder.to_string_lossy()),
                ),
            ]
            .into(),
        );
    }

    #[test]
    fn a_run_with_scheduled_backups_off_saves_nothing() {
        let state = test_state();
        let ctx = JobContext::for_test(state.clone());

        run(&ctx).unwrap();

        assert!(!schedule::default_folder(&state.config.data_dir).exists());
    }

    #[test]
    fn a_run_saves_a_backup_into_the_folder_the_owner_chose() {
        let state = test_state();
        let folder = kroma_testing::temp_dir("backup-save");
        switched_on(&state, folder.path());
        let ctx = JobContext::for_test(state.clone());

        run(&ctx).unwrap();

        assert_eq!(schedule::saved_in(folder.path()).unwrap().len(), 1);
    }

    #[test]
    fn a_folder_that_is_gone_fails_the_run() {
        let state = test_state();
        let folder = kroma_testing::temp_dir("backup-save");
        switched_on(&state, &folder.path().join("unplugged"));
        let ctx = JobContext::for_test(state);

        let failed = run(&ctx);

        assert!(failed.is_err());
    }
}
