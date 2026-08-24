//! Pipeline stage `loudness`: EBU R128 measurement of each file's default audio
//! track, persisted with a derived verdict (`ok` / `highDynamics` /
//! `quietDialog`). Wraps [`crate::infra::loudness`].

use anyhow::Result;

use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

// One decode at a time: the measurement reads the whole container, and fanning
// out would starve any concurrent stream from the same (often network) mount.
stage! {
    short: "loudness",
    subject_kind: "file",
    concurrency: 1,
    pause_for_playback: true,
    schedule: Some("0 4 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.probe"))],
}

fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    crate::db::analyzable_file_sigs(&state.db)
}

fn process(ctx: &JobContext, file_id: &str) -> Result<()> {
    let Some((abs_path, tracks_json)) = crate::db::loudness_target(&ctx.state.db, file_id)? else {
        return Ok(());
    };
    if abs_path.starts_with("demo://") {
        return Ok(()); // seed rows have no real bytes to decode
    }
    let tracks: Vec<kroma_domain::AudioStream> =
        serde_json::from_str(&tracks_json).unwrap_or_default();
    let Some(track) = track_to_measure(&tracks) else {
        return Ok(());
    };
    let result = crate::infra::loudness::measure(
        std::path::Path::new(&abs_path),
        track.index,
        track.channels,
    )?;
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
        let tracks = vec![track(0, false), track(1, true), track(2, false)];
        assert_eq!(track_to_measure(&tracks).unwrap().index, 1);
    }

    #[test]
    fn with_no_default_marked_the_first_track_stands_in() {
        let tracks = vec![track(3, false), track(4, false)];
        assert_eq!(track_to_measure(&tracks).unwrap().index, 3);
    }

    #[test]
    fn a_file_with_no_audio_is_not_measured() {
        assert!(track_to_measure(&[]).is_none());
    }

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
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        assert!(process(&ctx, "no-such-file").is_ok());
    }

    #[test]
    fn a_file_whose_audio_cannot_be_decoded_fails_its_task() {
        let state = test_support::test_state();
        test_support::seed_movie(&state, "gone");
        set_target(
            &state,
            "gone-f",
            "/media/absent.mkv",
            r#"[{"index":0,"codec":"aac","default":true}]"#,
        );

        let ctx = JobContext::for_test(state.clone());
        assert!(process(&ctx, "gone-f").is_err());
        let n: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT count(*) FROM audio_analysis", [], |r| r.get(0))
            .unwrap_or(0);
        assert_eq!(n, 0);
    }

    #[test]
    fn a_demo_row_is_skipped_rather_than_decoded() {
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m1");
        set_target(
            &state,
            "m1-f",
            "demo://m1.mkv",
            r#"[{"index":0,"codec":"aac","default":true}]"#,
        );

        let ctx = JobContext::for_test(state.clone());
        assert!(process(&ctx, "m1-f").is_ok());
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
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m2");
        set_target(&state, "m2-f", "/media/m2.mkv", "[]");

        let ctx = JobContext::for_test(state);
        assert!(process(&ctx, "m2-f").is_ok());
    }

    fn measured(state: &crate::state::SharedState, file_id: &str) -> (f64, Option<f64>) {
        state
            .db
            .get()
            .unwrap()
            .query_row(
                "SELECT lufs_i, dialog_lufs FROM audio_analysis WHERE file_id = ?1",
                [file_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap()
    }

    fn seeded_with_wav(
        tag: &str,
        channels: u16,
        tracks: &str,
    ) -> (crate::state::SharedState, kroma_testing::TempDir) {
        let dir = kroma_testing::temp_dir(tag);
        let media = dir.path().join("tone.wav");
        test_support::write_test_wav(&media, 2.0, channels);

        let state = test_support::test_state();
        test_support::seed_movie(&state, tag);
        set_target(
            &state,
            &format!("{tag}-f"),
            &media.to_string_lossy(),
            tracks,
        );
        (state, dir)
    }

    #[test]
    fn a_stereo_mix_is_measured_and_stored_without_a_dialogue_reading() {
        let (state, _dir) = seeded_with_wav(
            "mono",
            1,
            r#"[{"index":0,"codec":"pcm","channels":2,"default":true}]"#,
        );

        process(&JobContext::for_test(state.clone()), "mono-f").unwrap();

        let (lufs, dialog) = measured(&state, "mono-f");
        assert!(
            lufs.is_finite() && lufs < 0.0,
            "a real measurement, got {lufs}"
        );
        assert!(dialog.is_none(), "there is no centre channel to read");
    }

    #[test]
    fn a_surround_mix_is_measured_twice_so_dialogue_can_be_judged() {
        let (state, _dir) = seeded_with_wav(
            "surround",
            6,
            r#"[{"index":0,"codec":"pcm","channels":6,"default":true}]"#,
        );

        process(&JobContext::for_test(state.clone()), "surround-f").unwrap();

        let (lufs, dialog) = measured(&state, "surround-f");
        assert!(lufs.is_finite());
        assert!(dialog.is_some(), "5.1 earns a centre-channel measurement");
    }

    #[test]
    fn enumerate_offers_only_probed_files() {
        let state = test_support::test_state();
        test_support::seed_movie(&state, "m3");
        assert!(enumerate(&state)
            .unwrap()
            .iter()
            .all(|(id, _)| id != "m3-f"));

        set_target(
            &state,
            "m3-f",
            "/media/m3.mkv",
            r#"[{"index":0,"codec":"aac"}]"#,
        );
        assert!(enumerate(&state)
            .unwrap()
            .iter()
            .any(|(id, _)| id == "m3-f"));
    }
}
