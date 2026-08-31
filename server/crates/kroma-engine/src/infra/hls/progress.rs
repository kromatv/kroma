//! What a live remux says about itself.
//!
//! ffmpeg writes a key=value block to `-progress` once a second. `speed` is the
//! number the operator has no other way to get: below 1.0x the encoder is
//! falling behind the film and the player will run out of segments before the
//! scene ends, which from the outside looks like a network fault. Everything
//! else here is context for that one figure.
//!
//! The file is append-only and every block repeats every key, so the newest
//! block is the last occurrence of each key before the final `progress=` line.
//! Only the tail is read: a two-hour session writes about a megabyte of these.

use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Where `spawn_stream` points `-progress`, relative to the session directory.
pub(super) const FILE: &str = "progress";

// Comfortably more than one block, which runs to about 150 bytes.
const TAIL: u64 = 4096;

#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub(super) struct Progress {
    pub frames: u64,
    pub fps: f32,
    // Multiple of realtime. `-readrate` caps it, so a session that is keeping up
    // sits at the read rate rather than climbing past it.
    pub speed: f32,
    pub out_time_ms: u64,
    pub dropped: u64,
    pub ended: bool,
}

/// The newest block in `dir`'s progress file, or None before ffmpeg has written one.
pub(super) fn read(dir: &Path) -> Option<Progress> {
    parse(&tail(&dir.join(FILE))?)
}

fn tail(path: &Path) -> Option<Vec<u8>> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(TAIL))).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn parse(tail: &[u8]) -> Option<Progress> {
    let text = String::from_utf8_lossy(tail);
    let end = text.rfind("progress=")?;
    let mut out = Progress {
        ended: text[end..].starts_with("progress=end"),
        ..Progress::default()
    };
    for line in text[..end].lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "frame" => out.frames = value.parse().unwrap_or(out.frames),
            "fps" => out.fps = value.parse().unwrap_or(out.fps),
            "speed" => {
                out.speed = value.trim_end_matches('x').parse().unwrap_or(out.speed);
            }
            // Under `-copyts` this starts at the anchor, and ffmpeg spells an
            // unset clock as a large negative rather than as `N/A`.
            "out_time_us" => {
                if let Ok(us) = value.parse::<i64>() {
                    out.out_time_ms = (us.max(0) / 1000) as u64;
                }
            }
            "drop_frames" => out.dropped = value.parse().unwrap_or(out.dropped),
            _ => {}
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLOCK: &str = "frame=120\nfps=24.50\nstream_0_0_q=-0.0\nbitrate=N/A\n\
                         total_size=N/A\nout_time_us=5000000\nout_time_ms=5000000\n\
                         out_time=00:00:05.000000\ndup_frames=0\ndrop_frames=3\n\
                         speed=1.98x\nprogress=continue\n";

    #[test]
    fn reads_the_rate_the_encoder_is_actually_holding() {
        let p = parse(BLOCK.as_bytes()).expect("a written block");

        assert_eq!(p.frames, 120);
        assert!((p.fps - 24.5).abs() < 1e-3);
        assert!((p.speed - 1.98).abs() < 1e-3);
        assert_eq!(p.out_time_ms, 5_000);
        assert_eq!(p.dropped, 3);
        assert!(!p.ended);
    }

    #[test]
    fn the_newest_block_wins_over_every_earlier_one() {
        let older = BLOCK.replace("frame=120", "frame=10").replace("speed=1.98x", "speed=0.30x");

        let p = parse(format!("{older}{BLOCK}").as_bytes()).expect("two blocks");

        assert_eq!(p.frames, 120);
        assert!((p.speed - 1.98).abs() < 1e-3);
    }

    // The tail read starts at a byte offset, so the first block it sees is
    // usually cut in half.
    #[test]
    fn a_block_the_tail_read_cut_in_half_does_not_corrupt_the_answer() {
        let cut = format!("_us=999\nspeed=0.10x\nprogress=continue\n{BLOCK}");

        let p = parse(cut.as_bytes()).expect("a whole block after a fragment");

        assert_eq!(p.frames, 120);
        assert!((p.speed - 1.98).abs() < 1e-3);
    }

    #[test]
    fn the_last_block_of_a_finished_run_says_so() {
        let done = BLOCK.replace("progress=continue", "progress=end");

        assert!(parse(done.as_bytes()).expect("a final block").ended);
    }

    #[test]
    fn values_ffmpeg_has_not_computed_yet_leave_the_field_alone() {
        let early = "frame=0\nfps=0.00\nbitrate=N/A\ntotal_size=N/A\n\
                     out_time_us=-577014400000\nspeed=N/A\nprogress=continue\n";

        let p = parse(early.as_bytes()).expect("an opening block");

        assert_eq!(p.speed, 0.0);
        assert_eq!(p.out_time_ms, 0, "a clock ffmpeg has not set reads as zero");
    }

    #[test]
    fn nothing_is_reported_before_the_first_block_lands() {
        assert_eq!(parse(b"frame=1\nfps=2\n"), None);
        assert_eq!(parse(b""), None);
    }

    #[test]
    fn reads_from_the_session_directory() {
        let dir = kroma_testing::temp_dir("hls-progress");
        std::fs::write(dir.path().join(FILE), BLOCK).expect("progress file");

        assert_eq!(read(dir.path()).expect("a block").frames, 120);
        assert_eq!(read(&dir.path().join("nope")), None);
    }
}
