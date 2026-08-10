//! Pipeline stage `storyboard`: pre-generate the scrub-bar sprite sheet for each
//! playable item, so the first hover is instant. Wraps the existing
//! [`crate::infra::storyboard`] engine (its `generate_blocking_cancellable` already skips a
//! cached sheet); the ledger adds resumability, priority for fresh items, and
//! per-item failure visibility.

use anyhow::{anyhow, Result};

use crate::services::jobs::{JobContext, Trigger};
use crate::state::SharedState;

use super::common::stage;

// Two concurrent ffmpeg passes, matching the engine's own gate; the dispatcher
// pauses between items while anyone is streaming. Nightly, on a library change, and
// manually.
stage! {
    short: "storyboard",
    subject_kind: "item",
    concurrency: 2,
    pause_for_playback: true,
    schedule: Some("0 2 * * *"),
    triggers: &[Trigger::LibraryChange],
}

// Every playable item (has a backing file + a known duration), signed by that
// file's `mtime:size` so a replaced file regenerates. Cached items are still
// enumerated so the ledger shows them `done`; `process` no-ops on a cache hit.
// Unprobed items (duration unknown) are simply skipped until a later probe/scan
// makes them eligible that is the probe dependency, encoded as a filter.
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let items = crate::db::list_items(&state.db, None)?;
    Ok(items
        .into_iter()
        .filter_map(|i| {
            let abs = i.abs_path.as_deref()?;
            if i.duration_ms.unwrap_or(0) == 0 {
                return None;
            }
            let sig = super::sig_for_path(abs);
            Some((i.id, sig))
        })
        .collect())
}

fn process(ctx: &JobContext, item_id: &str) -> Result<()> {
    let item = crate::db::get_item(&ctx.state.db, item_id)?
        .ok_or_else(|| anyhow!("item {item_id} no longer exists"))?;
    // `generate_blocking_cancellable` returns `Err(String)` with the real cause
    // (ffmpeg error, missing encoder, timeout) and is a no-op when already cached.
    // Thread the stage's cancellation so cancelling the job kills the in-flight
    // ffmpeg pass at the next poll tick instead of running out the full timeout.
    let cancel = || ctx.cancelled();
    ctx.state.storyboard.generate_blocking_cancellable(&item, &cancel).map_err(|e| anyhow!(e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::jobs::JobContext;
    use crate::test_support::{seed_movie, test_state};

    fn set_duration(state: &SharedState, item_id: &str, ms: i64) {
        state
            .db
            .get()
            .unwrap()
            .execute(&format!("UPDATE items SET duration_ms = {ms} WHERE id = '{item_id}'"), [])
            .unwrap();
    }

    #[test]
    fn an_item_whose_duration_is_unknown_waits_for_its_probe() {
        let state = test_state();
        seed_movie(&state, "m1");
        assert!(enumerate(&state).unwrap().is_empty());

        set_duration(&state, "m1", 120_000);
        let subjects = enumerate(&state).unwrap();
        assert_eq!(subjects.len(), 1);
        assert_eq!(subjects[0].0, "m1");
        assert!(!subjects[0].1.is_empty(), "signed by the file it was made from");
    }

    #[test]
    fn an_item_that_vanished_since_enumerate_is_reported_not_silently_skipped() {
        let state = test_state();
        let err = process(&JobContext::for_test(state), "ghost").unwrap_err();
        assert!(format!("{err:#}").contains("no longer exists"), "{err:#}");
    }

    #[test]
    fn the_engines_own_reason_reaches_the_ledger() {
        let state = test_state();
        seed_movie(&state, "m1");
        let err = process(&JobContext::for_test(state), "m1").unwrap_err();
        assert!(format!("{err:#}").contains("unknown duration"), "{err:#}");
    }
}
