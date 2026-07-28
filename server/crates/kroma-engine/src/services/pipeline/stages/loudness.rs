//! Pipeline stage `loudness`: EBU R128 measurement of each file's default audio
//! track (integrated loudness, loudness range, true peak, and the centre
//! channel alone on 5.1+), persisted with a derived verdict
//! (`ok` / `highDynamics` / `quietDialog`). Wraps [`crate::infra::loudness`].
//!
//! Audio-only decode, but it still READS the whole container so the cost is
//! dominated by I/O on big remuxes: one file at a time, paused during playback,
//! and only probed files are in scope (the track layout must be known).

use anyhow::Result;

use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

// One decode at a time: the measurement is disk-read-bound, and fanning out would
// starve any concurrent stream from the same (often network) mount. Nightly (after
// the 1:00 probe pass has landed fresh files), and chained after `pipeline.probe`
// so a manual probe drain flows straight into analysis.
stage! {
    short: "loudness",
    subject_kind: "file",
    concurrency: 1,
    pause_for_playback: true,
    schedule: Some("0 4 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.probe"))],
}

/// Every **probed** file, signed by `mtime:size` (a replaced file re-measures;
/// unprobed files enter scope once the probe stage lands).
fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    crate::db::analyzable_file_sigs(&state.db)
}

fn process(ctx: &JobContext, file_id: &str) -> Result<()> {
    let Some((abs_path, tracks_json)) = crate::db::loudness_target(&ctx.state.db, file_id)? else {
        return Ok(()); // file row gone (or un-probed) since enumerate
    };
    if abs_path.starts_with("demo://") {
        return Ok(()); // demo/seed rows have no real bytes to decode
    }
    let tracks: Vec<kroma_domain::AudioStream> =
        serde_json::from_str(&tracks_json).unwrap_or_default();
    let Some(track) = track_to_measure(&tracks) else {
        return Ok(()); // no audio at all: nothing to measure
    };
    let result =
        crate::infra::loudness::measure(std::path::Path::new(&abs_path), track.index, track.channels)?;
    let analysis = crate::infra::loudness::to_analysis(&result);
    crate::db::set_audio_analysis(&ctx.state.db, file_id, track.index, &analysis)?;
    ctx.info(format!(
        "loudness {}: I={:.1} LUFS, LRA={:.1} LU{} -> {:?}",
        abs_path,
        analysis.lufs_i,
        analysis.lra,
        analysis
            .dialog_lufs
            .map(|d| format!(", dialog={d:.1} LUFS"))
            .unwrap_or_default(),
        analysis.verdict,
    ));
    Ok(())
}

/// The one track worth a full decode: the one playback picks by default, else
/// the first. Measuring every track would multiply the cost of the pass by the
/// track count for data nothing reads, and measuring the WRONG one puts a
/// commentary track's numbers on the item's dialogue verdict.
fn track_to_measure(tracks: &[kroma_domain::AudioStream]) -> Option<&kroma_domain::AudioStream> {
    tracks.iter().find(|t| t.default).or_else(|| tracks.first())
}

#[cfg(test)]
mod tests {
    use kroma_domain::AudioStream;

    use super::*;
    use crate::services::jobs::JobContext;
    use crate::test_support;

    fn track(index: u32, default: bool) -> AudioStream {
        AudioStream {
            index,
            codec: "eac3".into(),
            channels: Some(6),
            language: Some("eng".into()),
            title: None,
            default,
        }
    }

    #[test]
    fn the_default_track_is_the_one_measured() {
        // Not the first: a disc rip routinely lists the commentary first, and a
        // commentary's loudness would sit on the item as its dialogue verdict.
        let tracks = vec![track(0, false), track(1, true), track(2, false)];
        assert_eq!(track_to_measure(&tracks).unwrap().index, 1);
    }

    #[test]
    fn with_no_default_marked_the_first_track_stands_in() {
        // Plenty of containers mark none. Measuring nothing at all would leave
        // every such file permanently unanalysed.
        let tracks = vec![track(3, false), track(4, false)];
        assert_eq!(track_to_measure(&tracks).unwrap().index, 3);
    }

    #[test]
    fn a_file_with_no_audio_is_not_measured() {
        assert!(track_to_measure(&[]).is_none());
    }

    /// Point `file_id`'s row at `abs_path` with `tracks` as its audio layout,
    /// and mark it probed (which is what puts it in scope at all).
    fn set_target(state: &crate::state::SharedState, file_id: &str, abs: &str, tracks: &str) {
        state
            .db
            .get()
            .unwrap()
            .execute(
                &format!(
                    "UPDATE files SET abs_path = '{abs}', audio_tracks = '{tracks}', \
                     probed = 1 WHERE id = '{file_id}'"
                ),
                [],
            )
            .unwrap();
    }

    #[test]
    fn a_file_that_vanished_between_enumerate_and_process_is_skipped() {
        // The pass enumerates once and then works through the list; a file
        // deleted meanwhile must not fail the whole run.
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        assert!(process(&ctx, "no-such-file").is_ok());
    }

    #[test]
    fn a_demo_row_is_skipped_rather_than_decoded() {
        // The built-in demo catalogue has `demo://` paths and no bytes behind
        // them. Without this the nightly pass would try to decode every one and
        // fill the job log with failures on a fresh install.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m1");
        set_target(&state, "m1-f", "demo://m1.mkv", r#"[{"index":0,"codec":"aac","default":true}]"#);

        let ctx = JobContext::for_test(state.clone());
        assert!(process(&ctx, "m1-f").is_ok());
        // Nothing was written for it.
        let n: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT count(*) FROM audio_analysis", [], |r| r.get(0))
            .unwrap_or(0);
        assert_eq!(n, 0);
    }

    #[test]
    fn a_file_with_no_audio_track_is_skipped_before_any_decode() {
        // A silent-video row would otherwise reach ffmpeg with no track to map.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m2");
        set_target(&state, "m2-f", "/media/m2.mkv", "[]");

        let ctx = JobContext::for_test(state);
        assert!(process(&ctx, "m2-f").is_ok());
    }

    #[test]
    fn enumerate_offers_only_probed_files() {
        // An un-probed file has no known track layout, so there is nothing to
        // point the decoder at.
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m3");
        assert!(enumerate(&state).unwrap().iter().all(|(id, _)| id != "m3-f"));

        set_target(&state, "m3-f", "/media/m3.mkv", r#"[{"index":0,"codec":"aac"}]"#);
        assert!(enumerate(&state).unwrap().iter().any(|(id, _)| id == "m3-f"));
    }
}
