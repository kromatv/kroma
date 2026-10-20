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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::state::SharedState;
    use crate::test_support::{serve_json, test_state, test_state_with_releases};

    fn logged(state: &SharedState) -> String {
        let conn = state.db.get().unwrap();
        let mut stmt = conn
            .prepare("SELECT message FROM job_logs WHERE run_id = 'test-run' ORDER BY ts")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect::<Vec<_>>().join("\n")
    }

    fn feed(tag: &str) -> SharedState {
        let tag = tag.to_string();
        let (base, _) = serve_json(move |_| {
            (
                200,
                json!({ "tag_name": tag, "html_url": "https://x", "assets": [] }),
            )
        });
        test_state_with_releases(&base)
    }

    #[test]
    fn a_server_with_checks_off_asks_nothing() {
        let state = test_state();
        state.settings.set_patch(
            &state.db,
            [(updates::AUTO_KEY.to_string(), json!(false))].into(),
        );

        run(&JobContext::for_test(state.clone())).unwrap();

        assert!(logged(&state).contains("update checks are off"));
        assert!(updates::status(&state).checked_at.is_none());
    }

    #[test]
    fn a_feed_that_does_not_answer_is_logged_not_failed() {
        let state = test_state();

        run(&JobContext::for_test(state.clone())).unwrap();

        assert!(logged(&state).contains("the release feed did not answer"));
    }

    #[test]
    fn a_newer_release_is_logged_by_its_version() {
        let state = feed("v999.0.0");

        run(&JobContext::for_test(state.clone())).unwrap();

        assert!(logged(&state).contains("999.0.0 is available"));
    }

    #[test]
    fn a_feed_with_nothing_newer_says_the_server_is_current() {
        let state = feed("v0.0.1");

        run(&JobContext::for_test(state.clone())).unwrap();

        assert!(logged(&state).contains("is current"));
    }
}
