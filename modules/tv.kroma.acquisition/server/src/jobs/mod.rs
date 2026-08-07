//! The acquisition background jobs (search / import / match), moved out of the
//! core kroma-engine job roster so the core names no module crate. Each handler
//! file owns its `pub const SPEC` + `pub fn run`; the crate root gathers the
//! three SPECs into [`crate::JOBS`], which the binary hands to `AppState::new`
//! for registration.

pub mod import;
pub mod match_;
pub mod search;

use kroma_module_sdk::engine::services::jobs::JobContext;
use kroma_module_sdk::host::HostCtx;

fn acquisition_disabled(ctx: &JobContext) -> bool {
    if ctx.state.module_enabled(crate::MODULE_ID) {
        return false;
    }
    ctx.info("Acquisition module disabled; skipping.");
    true
}

/// Declares one acquisition job: builds its [`Builtin`] `SPEC` and a `run`
/// handler that short-circuits when the module is disabled. `$ctx` binds the
/// [`JobContext`] in scope for the body.
macro_rules! acquisition_job {
    (
        key: $key:literal,
        schedule: $schedule:expr,
        triggers: $triggers:expr,
        run: |$ctx:ident| $body:block $(,)?
    ) => {
        pub const SPEC: kroma_module_sdk::engine::services::jobs::Builtin =
            kroma_module_sdk::engine::services::jobs::Builtin {
                key: kroma_module_sdk::engine::services::jobs::JobKey($key),
                category: kroma_module_sdk::engine::model::Category::Acquisition,
                schedule: $schedule,
                triggers: $triggers,
                run,
            };

        pub fn run(
            $ctx: &kroma_module_sdk::engine::services::jobs::JobContext,
        ) -> anyhow::Result<()> {
            if $crate::jobs::acquisition_disabled($ctx) {
                return Ok(());
            }
            $body
        }
    };
}
pub(crate) use acquisition_job;
