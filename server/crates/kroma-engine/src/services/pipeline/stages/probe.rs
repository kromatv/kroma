//! Pipeline stage `probe`: ffprobe each file (codecs, duration, tracks, embedded
//! chapters) and persist it. Wraps [`crate::infra::probe::probe_one`]. The
//! detached scan-time probe pass still runs for immediate results + the
//! `/api/status` activity panel; this stage is the incremental, observable,
//! retriable view over the same `files.probed` state (a no-op on already-probed
//! files, so the two coexist safely).

use anyhow::Result;

use crate::services::jobs::JobContext;
use crate::state::SharedState;

use super::common::stage;

// Nightly + manual. Not chained after a scan: the detached scan-time pass covers
// that, and racing it would double-ffprobe the same files.
stage! {
    short: "probe",
    subject_kind: "file",
    concurrency: 4,
    pause_for_playback: false,
    schedule: Some("0 1 * * *"),
    triggers: &[],
}

// Every file, signed by `mtime:size` (a replaced file re-probes).
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    crate::db::all_file_sigs(&state.db)
}

fn process(ctx: &JobContext, file_id: &str) -> Result<()> {
    let Some((abs_path, item_id, probed)) = crate::db::probe_target(&ctx.state.db, file_id)? else {
        return Ok(()); // file row gone since enumerate; nothing to do
    };
    if probed {
        return Ok(()); // already probed (here or by the scan-time pass)
    }
    crate::infra::probe::probe_one(
        &ctx.state.db,
        ctx.state.ffprobe_available,
        &ctx.state.events,
        file_id,
        &abs_path,
        &item_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_movie, test_state};

    fn probed_flag(state: &SharedState, file_id: &str) -> i64 {
        state
            .db
            .get()
            .unwrap()
            .query_row("SELECT probed FROM files WHERE id=?1", [file_id], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn every_file_is_in_scope_signed_by_its_mtime_and_size() {
        let state = test_state();
        seed_movie(&state, "m1");
        let subjects = enumerate(&state).unwrap();
        assert_eq!(subjects.len(), 1);
        assert_eq!(subjects[0].0, "m1-f");
        assert_eq!(subjects[0].1, "0:0", "an unscanned row has neither yet");

        state
            .db
            .get()
            .unwrap()
            .execute("UPDATE files SET mtime=42, size=99 WHERE id='m1-f'", [])
            .unwrap();
        assert_eq!(enumerate(&state).unwrap()[0].1, "42:99");
    }

    #[test]
    fn a_file_row_that_vanished_since_enumerate_is_not_a_failure() {
        let state = test_state();
        let ctx = JobContext::for_test(state);
        process(&ctx, "gone").unwrap();
    }

    #[test]
    fn an_already_probed_file_is_left_to_the_scan_time_pass() {
        let state = test_state();
        seed_movie(&state, "m1");
        state
            .db
            .get()
            .unwrap()
            .execute("UPDATE files SET probed=1 WHERE id='m1-f'", [])
            .unwrap();
        let mut rx = state.events.subscribe();
        process(&JobContext::for_test(state.clone()), "m1-f").unwrap();
        assert!(rx.try_recv().is_err(), "nothing was re-probed, so nothing changed");
    }

    #[test]
    fn probing_a_files_first_pass_marks_it_and_announces_the_item() {
        let state = test_state();
        seed_movie(&state, "m1");
        assert_eq!(probed_flag(&state, "m1-f"), 0);

        let mut rx = state.events.subscribe();
        process(&JobContext::for_test(state.clone()), "m1-f").unwrap();

        assert_eq!(probed_flag(&state, "m1-f"), 1);
        let event = rx.try_recv().expect("item.updated published");
        let msg = event.payload_unrouted();
        assert!(msg.contains("m1"), "event: {msg}");
    }
}
