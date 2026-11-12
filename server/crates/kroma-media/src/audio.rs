//! One audio track of an input, decoded to raw PCM.

use std::path::Path;
use std::process::Command;
use std::time::Duration;

pub use kroma_primitives::pcm::{Pcm, SampleFormat};

use crate::ffmpeg_run::run_capturing_cancellable;
use crate::subtitles::timeout_for;
use crate::tmp_file::{finalize, unique_tmp};

const SHORTEST_BUDGET: Duration = Duration::from_secs(3600);

/// Decode audio track `track` of `input` into `out` as `pcm`, in one pass drawn
/// from the ffmpeg budget, and answer the bytes written. `out` appears only once
/// the whole track is in it. The pass gets an hour, or longer for an input too
/// large to read in one at 20 MB/s. Blocking; run it on a blocking thread.
pub fn decode(
    input: &Path,
    track: u32,
    pcm: Pcm,
    out: &Path,
    cancel: &dyn Fn() -> bool,
) -> Result<u64, String> {
    if let Some(problem) = pcm.problem() {
        return Err(problem);
    }
    let tmp = unique_tmp(out);
    let mut pass = Command::new("ffmpeg");
    pass.args(kroma_primitives::pcm::decode_args(input, track, pcm, &tmp));
    let budget = timeout_for(&input.to_string_lossy()).max(SHORTEST_BUDGET);
    let written = run_capturing_cancellable(pass, budget, cancel).and_then(|()| {
        std::fs::metadata(&tmp)
            .map(|meta| meta.len())
            .map_err(|error| format!("the decoded track is missing: {error}"))
    });
    match written {
        Ok(bytes) if finalize(&tmp, out) => Ok(bytes),
        Ok(_) => Err(format!(
            "the decoded track could not be moved to {}",
            out.display()
        )),
        Err(reason) => {
            let _ = std::fs::remove_file(&tmp);
            Err(reason)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    const MONO_16K: Pcm = Pcm {
        sample_rate: 16_000,
        channels: 1,
        format: SampleFormat::F32le,
    };

    fn tone(dir: &Path, seconds: u32) -> PathBuf {
        let clip = dir.join("tone.wav");
        let graph = format!("sine=frequency=440:duration={seconds}:sample_rate=44100");
        let made = Command::new("ffmpeg")
            .args(["-v", "error", "-nostdin", "-y"])
            .args(crate::input::generated(&graph))
            .arg(&clip)
            .output()
            .expect("run ffmpeg");
        assert!(
            made.status.success(),
            "{}",
            String::from_utf8_lossy(&made.stderr)
        );
        clip
    }

    fn names_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_track_lands_whole_in_the_shape_asked_for() {
        let dir = kroma_testing::temp_dir("audio-decode");
        let clip = tone(dir.path(), 1);
        let out = dir.path().join("pcm");

        let written = decode(&clip, 0, MONO_16K, &out, &|| false);

        assert_eq!(written, Ok(16_000 * 4));
        assert_eq!(std::fs::metadata(&out).unwrap().len(), 16_000 * 4);
        assert_eq!(names_in(dir.path()), ["pcm", "tone.wav"]);
    }

    #[test]
    fn sixteen_bit_stereo_holds_two_bytes_per_sample_per_channel() {
        let dir = kroma_testing::temp_dir("audio-decode-s16");
        let clip = tone(dir.path(), 1);
        let pcm = Pcm {
            sample_rate: 8_000,
            channels: 2,
            format: SampleFormat::S16le,
        };

        let written = decode(&clip, 0, pcm, &dir.path().join("pcm"), &|| false);

        assert_eq!(written, Ok(8_000 * 2 * 2));
    }

    #[test]
    fn a_track_the_input_does_not_hold_fails_and_leaves_nothing_behind() {
        let dir = kroma_testing::temp_dir("audio-decode-missing");
        let clip = tone(dir.path(), 1);

        let written = decode(&clip, 3, MONO_16K, &dir.path().join("pcm"), &|| false);

        assert!(written.is_err());
        assert_eq!(names_in(dir.path()), ["tone.wav"]);
    }

    #[test]
    fn a_cancelled_decode_stops_and_leaves_nothing_behind() {
        let dir = kroma_testing::temp_dir("audio-decode-cancel");
        let clip = tone(dir.path(), 120);

        let written = decode(&clip, 0, MONO_16K, &dir.path().join("pcm"), &|| true);

        assert_eq!(written, Err("cancelled".to_string()));
        assert_eq!(names_in(dir.path()), ["tone.wav"]);
    }

    #[test]
    fn a_shape_no_decode_writes_is_refused_before_ffmpeg_starts() {
        let dir = kroma_testing::temp_dir("audio-decode-shape");
        let pcm = Pcm {
            channels: 0,
            ..MONO_16K
        };

        let written = decode(
            &dir.path().join("absent.wav"),
            0,
            pcm,
            &dir.path().join("pcm"),
            &|| false,
        );

        assert!(written.unwrap_err().contains("channels"));
    }
}
