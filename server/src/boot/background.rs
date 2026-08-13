//! The long-running work started once the state exists: metadata probing, the
//! search index, the reapers that reclaim sessions and transcodes, the job
//! scheduler, and bringing the installed modules up.

use kroma_engine::{infra, services, state};

/// Start everything that runs for the life of the process. Ordered only where
/// it matters: the modules come up last, so the services they resolve are all
/// already running.
pub async fn spawn(state: &state::SharedState) {
    // Phase 2: ffprobe every unprobed file, overlapping request handling.
    infra::probe::spawn_probe_pass(
        state.db.clone(),
        state.ffprobe_available,
        state.events.clone(),
        state.activity.clone(),
    );

    services::search::spawn_reindex(state.clone());

    state.hls.spawn_reaper();
    state.playback.spawn_reaper(state.db.clone(), state.events.clone());
    state.cast.spawn_reaper(state.events.clone());
    state.metrics.spawn_sampler();
    state.jobs.clone().spawn_scheduler(state.clone());

    // Brings enabled modules up in dependency order; each starts its own
    // resources in on_enable, so this shell names no module.
    kroma_module_kernel::apply_enabled_states(state).await;
}
