//! Where a film's credits start, read from its picture: rolling credits are a
//! dark frame carrying dense small text, and they run to the end of the file.
//! `ffmpeg` decodes the keyframes of the final stretch as tiny grayscale frames
//! at one per second; the pure half scores each frame and finds the earliest
//! point from which the tail stays credits-like.

use std::ffi::OsString;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};

pub const WIDTH: usize = 160;
pub const HEIGHT: usize = 90;
const FRAME_BYTES: usize = WIDTH * HEIGHT;

const DARK_LUMA: u8 = 40;
const EDGE_STEP: i16 = 60;
const MIN_DARK: f32 = 0.6;
const MIN_EDGES: f32 = 0.02;
const MAX_EDGES: f32 = 0.35;
const BLACK_DARK: f32 = 0.985;
const BLACK_EDGES: f32 = 0.002;

/// Seconds of text the tail must carry before it is called the credits.
pub const MIN_TEXT_S: usize = 60;
const MIN_COVERAGE: f32 = 0.6;
const GAP_S: usize = 4;
const SNAP_BACK_S: usize = 20;

const WINDOW_FRACTION: f64 = 0.2;
const MIN_WINDOW_S: f64 = 300.0;
const MAX_WINDOW_S: f64 = 1500.0;

/// What one frame looks like: the share of pixels that are dark, and the share
/// of horizontal neighbours that differ sharply (small text is nothing but).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameStats {
    pub dark: f32,
    pub edges: f32,
}

impl FrameStats {
    fn is_black(self) -> bool {
        self.dark >= BLACK_DARK && self.edges <= BLACK_EDGES
    }

    fn is_text_on_dark(self) -> bool {
        self.dark >= MIN_DARK && (MIN_EDGES..=MAX_EDGES).contains(&self.edges)
    }
}

/// Score one `WIDTH` x `HEIGHT` grayscale frame.
pub fn frame_stats(gray: &[u8]) -> FrameStats {
    let total = gray.len().max(1) as f32;
    let dark = gray.iter().filter(|&&p| p < DARK_LUMA).count() as f32 / total;
    let mut steps = 0usize;
    let mut pairs = 0usize;
    let (rows, _) = gray.as_chunks::<WIDTH>();
    for row in rows {
        for w in row.windows(2) {
            pairs += 1;
            if (i16::from(w[0]) - i16::from(w[1])).abs() >= EDGE_STEP {
                steps += 1;
            }
        }
    }
    FrameStats {
        dark,
        edges: steps as f32 / pairs.max(1) as f32,
    }
}

/// The frame index (one per second) at which the credits begin: the earliest
/// text-on-dark frame that opens a run carrying at least [`MIN_TEXT_S`] of text,
/// after which most of the tail stays dark, snapped back onto the fade to black
/// that precedes it. `None` when the tail never looks like credits.
pub fn credits_start(frames: &[FrameStats]) -> Option<usize> {
    let n = frames.len();
    let inside: Vec<bool> = frames
        .iter()
        .map(|f| f.is_text_on_dark() || f.is_black())
        .collect();
    let mut inside_after = vec![0usize; n + 1];
    for i in (0..n).rev() {
        inside_after[i] = inside_after[i + 1] + usize::from(inside[i]);
    }
    let start = (0..n).find(|&i| {
        if !frames[i].is_text_on_dark() {
            return false;
        }
        let coverage = inside_after[i] as f32 / (n - i) as f32;
        coverage >= MIN_COVERAGE && text_in_run(frames, &inside, i) >= MIN_TEXT_S
    })?;
    Some(snap_to_fade(frames, start))
}

fn text_in_run(frames: &[FrameStats], inside: &[bool], from: usize) -> usize {
    let mut text = 0usize;
    let mut gap = 0usize;
    for i in from..frames.len() {
        if inside[i] {
            gap = 0;
            text += usize::from(frames[i].is_text_on_dark());
        } else {
            gap += 1;
            if gap > GAP_S {
                break;
            }
        }
    }
    text
}

fn snap_to_fade(frames: &[FrameStats], start: usize) -> usize {
    let floor = start.saturating_sub(SNAP_BACK_S);
    let mut at = start;
    while at > floor && frames[at - 1].is_black() {
        at -= 1;
    }
    at
}

/// Scan the final stretch of `path` and return where the credits start, in ms
/// from the beginning of the file. `duration_ms` bounds the window.
pub fn credits_start_ms(path: &Path, duration_ms: u64) -> Result<Option<u64>> {
    let duration_s = duration_ms as f64 / 1000.0;
    let window_s = (duration_s * WINDOW_FRACTION)
        .clamp(MIN_WINDOW_S, MAX_WINDOW_S)
        .min(duration_s);
    let window_start_s = duration_s - window_s;
    let frames = scan_tail(path, window_start_s)?;
    Ok(credits_start(&frames).map(|i| ((window_start_s + i as f64) * 1000.0) as u64))
}

fn scan_tail(path: &Path, window_start_s: f64) -> Result<Vec<FrameStats>> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(decode_args(path, window_start_s))
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let out = {
        let _permit = kroma_media::ffmpeg_gate::acquire();
        cmd.output().context("spawn ffmpeg for the credits scan")?
    };
    if !out.status.success() {
        bail!("ffmpeg exited with {}", out.status);
    }
    let frames: Vec<FrameStats> = out
        .stdout
        .as_chunks::<FRAME_BYTES>()
        .0
        .iter()
        .map(|frame| frame_stats(frame))
        .collect();
    if frames.is_empty() {
        bail!("no video decoded from {}", path.display());
    }
    Ok(frames)
}

fn decode_args(path: &Path, window_start_s: f64) -> Vec<OsString> {
    let mut args: Vec<OsString> = Vec::new();
    args.extend(
        [
            "-v",
            "error",
            "-nostdin",
            "-threads",
            "1",
            "-skip_frame",
            "nokey",
        ]
        .map(OsString::from),
    );
    args.push(OsString::from("-ss"));
    args.push(OsString::from(format!("{window_start_s:.3}")));
    args.push(OsString::from("-i"));
    args.push(path.as_os_str().to_os_string());
    args.extend(["-an", "-sn", "-vf"].map(OsString::from));
    args.push(OsString::from(format!(
        "fps=1,scale={WIDTH}:{HEIGHT},format=gray"
    )));
    args.extend(["-f", "rawvideo", "-"].map(OsString::from));
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(fill: u8, text_rows: usize) -> Vec<u8> {
        let mut gray = vec![fill; FRAME_BYTES];
        for row in 0..text_rows {
            let y = (row * 4 + 2) % HEIGHT;
            for x in (0..WIDTH).step_by(3) {
                gray[y * WIDTH + x] = 230;
            }
        }
        gray
    }

    fn black() -> FrameStats {
        frame_stats(&frame(5, 0))
    }

    fn credits() -> FrameStats {
        frame_stats(&frame(5, 12))
    }

    fn scene() -> FrameStats {
        let mut gray = vec![120u8; FRAME_BYTES];
        for (i, p) in gray.iter_mut().enumerate() {
            *p = 90 + (i % 7) as u8 * 5;
        }
        frame_stats(&gray)
    }

    fn night() -> FrameStats {
        let mut gray = vec![20u8; FRAME_BYTES];
        for (i, p) in gray.iter_mut().enumerate() {
            *p = 15 + (i % 5) as u8 * 3;
        }
        frame_stats(&gray)
    }

    #[test]
    fn text_on_a_dark_ground_scores_dark_and_edgy_while_a_scene_does_neither() {
        assert!(credits().is_text_on_dark());
        assert!(black().is_black());
        assert!(!scene().is_text_on_dark());
        assert!(
            !night().is_text_on_dark(),
            "a dark scene carries no sharp edges"
        );
    }

    #[test]
    fn the_credits_start_where_the_text_begins_and_the_tail_stays_dark() {
        let mut frames = vec![scene(); 600];
        frames.extend(vec![credits(); 400]);

        assert_eq!(credits_start(&frames), Some(600));
    }

    #[test]
    fn the_start_snaps_back_onto_the_fade_to_black() {
        let mut frames = vec![scene(); 600];
        frames.extend(vec![black(); 3]);
        frames.extend(vec![credits(); 400]);

        assert_eq!(credits_start(&frames), Some(600));
    }

    #[test]
    fn a_scene_after_the_credits_does_not_move_the_start() {
        let mut frames = vec![scene(); 600];
        frames.extend(vec![credits(); 300]);
        frames.extend(vec![scene(); 60]);
        frames.extend(vec![credits(); 40]);

        assert_eq!(credits_start(&frames), Some(600));
    }

    #[test]
    fn a_short_title_card_or_a_dark_ending_is_not_the_credits() {
        let mut card = vec![scene(); 900];
        card.extend(vec![credits(); 30]);
        card.extend(vec![scene(); 70]);
        let mut dark = vec![scene(); 600];
        dark.extend(vec![night(); 400]);

        assert_eq!(credits_start(&card), None);
        assert_eq!(credits_start(&dark), None);
        assert_eq!(credits_start(&[]), None);
    }

    #[test]
    fn the_decoder_seeks_first_keeps_keyframes_only_and_drops_the_sound() {
        let args: Vec<String> = decode_args(Path::new("/media/film.mkv"), 5400.0)
            .into_iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        let at = |flag: &str| args.iter().position(|a| a == flag).unwrap();

        assert!(at("-skip_frame") < at("-i"));
        assert!(at("-ss") < at("-i"));
        assert_eq!(args[at("-ss") + 1], "5400.000");
        assert!(at("-an") > at("-i"));
        assert!(args[at("-vf") + 1].starts_with("fps=1,scale=160:90"));
    }
}
