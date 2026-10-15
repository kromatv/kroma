//! Text subtitle streams of one input, written out as WebVTT.

use std::ops::Range;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use crate::tmp_file::{finalize, unique_tmp};

const READ_BYTES_PER_SEC: u64 = 20 * 1024 * 1024;
const SHORTEST_BUDGET: u64 = 150;
const LONGEST_BUDGET: u64 = 7200;

/// Whether a normalised codec can become WebVTT. A picture subtitle (PGS,
/// VobSub, DVB) is a bitmap and never can.
pub fn is_text_codec(codec: &str) -> bool {
    matches!(
        codec,
        "subrip" | "srt" | "ass" | "ssa" | "mov_text" | "webvtt" | "vtt"
    )
}

/// The wall-clock budget one whole-file pass over `input` gets: its size at
/// 20 MB/s, held between 150 s and two hours. A text-subtitle demux is
/// bandwidth-bound, and a fixed ceiling times a 4K remux out and throws away
/// the partial output, so the next attempt reads it all again.
pub fn timeout_for(input: &str) -> Duration {
    let size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    let secs = (size / READ_BYTES_PER_SEC).clamp(SHORTEST_BUDGET, LONGEST_BUDGET);
    Duration::from_secs(secs)
}

/// One ffmpeg pass writing each of `tracks` (a subtitle-relative index and
/// where its WebVTT goes) out of `input`, so N tracks cost one read and not N.
///
/// `over_ms` bounds what is read, and the cues keep the input's own timestamps
/// rather than being rebased on its start: a caller holding part of a file
/// names the part it holds and nothing outside it is touched. `None` reads the
/// whole input. Each output lands atomically, and the count is how many did.
/// Blocking; run it on a blocking thread.
pub fn extract_vtt(
    input: &str,
    tracks: &[(usize, PathBuf)],
    over_ms: Option<Range<u64>>,
    timeout: Duration,
    cancel: &dyn Fn() -> bool,
) -> Result<usize, String> {
    if tracks.is_empty() {
        return Ok(0);
    }
    if let Some(dir) = tracks[0].1.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("could not create the subtitle output dir: {e}"))?;
    }
    let tmps: Vec<PathBuf> = tracks.iter().map(|(_, out)| unique_tmp(out)).collect();
    let outcome = crate::ffmpeg_run::run_capturing_cancellable(
        pass(input, tracks, over_ms.as_ref(), &tmps),
        timeout,
        cancel,
    );
    let mut landed = 0;
    for ((_, out), tmp) in tracks.iter().zip(&tmps) {
        match outcome.is_ok() && wrote_anything(tmp) && finalize(tmp, out) {
            true => landed += 1,
            false => drop(std::fs::remove_file(tmp)),
        }
    }
    match outcome {
        Ok(()) => Ok(landed),
        Err(reason) => Err(reason),
    }
}

// Text-subtitle decode is trivial; the cost is the demux read, so one thread
// keeps this from competing with a live remux for cores.
fn pass(
    input: &str,
    tracks: &[(usize, PathBuf)],
    over_ms: Option<&Range<u64>>,
    tmps: &[PathBuf],
) -> Command {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin", "-threads", "1", "-y"]);
    if let Some(over) = over_ms.filter(|over| over.start > 0) {
        cmd.args(["-ss", &seconds(over.start)]);
    }
    cmd.arg("-i").arg(input);
    for ((track, _), tmp) in tracks.iter().zip(tmps) {
        cmd.arg("-map").arg(format!("0:s:{track}"));
        // `-to` is an output option here on purpose: as an input one ffmpeg
        // ignores it and reads to the end, and `-copyts` is what stops the cue
        // times being rebased on `-ss`.
        if let Some(over) = over_ms {
            cmd.args(["-copyts", "-to", &seconds(over.end)]);
        }
        cmd.args(["-f", "webvtt"]).arg(tmp);
    }
    cmd
}

fn seconds(ms: u64) -> String {
    format!("{}.{:03}", ms / 1000, ms % 1000)
}

fn wrote_anything(vtt: &std::path::Path) -> bool {
    std::fs::metadata(vtt).is_ok_and(|m| m.len() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn worded(cmd: &Command) -> Vec<String> {
        cmd.get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn a_picture_subtitle_is_never_offered_as_text() {
        let text = ["subrip", "ass", "mov_text", "webvtt"].map(is_text_codec);
        let picture =
            ["pgs", "hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle"].map(is_text_codec);

        assert_eq!(text, [true; 4]);
        assert_eq!(picture, [false; 4]);
    }

    #[test]
    fn a_pass_over_a_whole_input_neither_seeks_nor_bounds_what_it_reads() {
        let tracks = [(2usize, PathBuf::from("/subs/a.vtt"))];

        let args = worded(&pass(
            "/films/one.mkv",
            &tracks,
            None,
            &[PathBuf::from("/t")],
        ));

        assert!(!args.contains(&"-ss".to_string()));
        assert!(!args.contains(&"-to".to_string()));
        assert_eq!(args.last().unwrap(), "/t");
    }

    #[test]
    fn a_pass_over_one_span_keeps_the_input_own_timestamps() {
        let tracks = [(0usize, PathBuf::from("/subs/a.vtt"))];

        let args = worded(&pass(
            "/films/one.mkv",
            &tracks,
            Some(&(90_500..180_000)),
            &[PathBuf::from("/t")],
        ));

        let at = |flag: &str| args.iter().position(|a| a == flag).expect(flag);
        assert_eq!(args[at("-ss") + 1], "90.500");
        assert_eq!(args[at("-to") + 1], "180.000");
        assert!(at("-copyts") > at("-i"));
        assert!(at("-ss") < at("-i"));
    }

    #[test]
    fn every_track_asked_for_is_mapped_into_the_one_read() {
        let tracks = [
            (0usize, PathBuf::from("/subs/a.vtt")),
            (4usize, PathBuf::from("/subs/b.vtt")),
        ];
        let tmps = [PathBuf::from("/a.part"), PathBuf::from("/b.part")];

        let args = worded(&pass("/films/one.mkv", &tracks, None, &tmps));

        assert_eq!(args.iter().filter(|a| *a == "-map").count(), 2, "{args:?}");
        assert!(args.contains(&"0:s:4".to_string()));
    }

    #[test]
    fn nothing_asked_for_spawns_nothing() {
        let ran = extract_vtt("/films/one.mkv", &[], None, Duration::ZERO, &|| false);

        assert_eq!(ran.unwrap(), 0);
    }

    #[test]
    fn a_budget_is_the_input_size_held_inside_the_band() {
        let unknown = timeout_for("/films/nothing-here.mkv");

        assert_eq!(unknown, Duration::from_secs(SHORTEST_BUDGET));
    }
}
