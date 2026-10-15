use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tracing::info;

use crate::ffmpeg_run::{run_capturing, run_capturing_cancellable, Cancel};

use super::{Plan, TILE_H, TILE_W};

const TILE_TIMEOUT: Duration = Duration::from_secs(120);
// What one head-to-head seek may read to find its frame. A complete file answers
// with the keyframe at the seek point, so this only has to clear a long GOP.
const MEASURE_WINDOW_S: u32 = 30;
const MAX_WORKERS: usize = 8;
const HWACCEL_MARGIN: f64 = 0.9;

static MEASURED: OnceLock<Decode> = OnceLock::new();

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Decode {
    /// `-hwaccel auto`, where [`probe`] measured it faster.
    Hardware,
    /// Software, with the decoder told to hand back keyframes only.
    Keyframes,
    /// Software, decoding every frame. What an input with holes in it needs:
    /// the keyframe filter reads on past the bytes on hand looking for one.
    Frames,
}

impl Decode {
    fn args(self) -> &'static [&'static str] {
        match self {
            // An input option, so it must precede `-i`. `nokey` and hwaccel are
            // incompatible on some devices, so the decoder emits every frame
            // and the pass takes the first.
            Decode::Hardware => &["-hwaccel", "auto"],
            Decode::Keyframes => &["-skip_frame", "nokey"],
            Decode::Frames => &[],
        }
    }
}

/// Whether `-hwaccel auto` is worth it on this box, decided ONCE per process by
/// a real head-to-head over `input` and then kept. Hardware decode offloads the
/// CPU, but each tile is its own process, so the per-process device init can
/// make it a net loss for single-frame seeks on a fast CPU and a clear win on a
/// weak NAS with an iGPU.
pub fn probe(input: &str, dur_s: f64) -> Decode {
    *MEASURED.get_or_init(|| measure(input, dur_s))
}

fn measure(input: &str, dur_s: f64) -> Decode {
    // No GPU device node means `-hwaccel auto` can only fall back to software,
    // so the head-to-head (four more full keyframe decodes, ~10 s on a weak
    // NAS) would be pure startup waste. A GPU-less Synology box lands here.
    #[cfg(target_os = "linux")]
    if !Path::new("/dev/dri").exists() {
        info!("storyboard decode path: software (no /dev/dri)");
        return Decode::Keyframes;
    }
    let at = (dur_s * 0.5) as u32;
    let Ok(scratch) = tempfile::Builder::new().prefix("kroma-sb-probe-").tempdir() else {
        return Decode::Keyframes;
    };
    let frame = scratch.path().join("frame.png");
    let cell = Cell {
        at_s: at,
        within_s: MEASURE_WINDOW_S,
    };
    // Warm the GOP into cache, and confirm software decode works at all.
    if extract_one(input, cell, &frame, Decode::Keyframes, &|| false).is_err() {
        return Decode::Keyframes;
    }
    // Interleaved and best of two, so scheduling noise and any residual warming
    // do not systematically favour one path.
    let timed = |decode: Decode| -> Option<Duration> {
        let started = Instant::now();
        extract_one(input, cell, &frame, decode, &|| false)
            .ok()
            .map(|()| started.elapsed())
    };
    let runs = [
        timed(Decode::Keyframes),
        timed(Decode::Hardware),
        timed(Decode::Keyframes),
        timed(Decode::Hardware),
    ];
    let software = [runs[0], runs[2]].into_iter().flatten().min();
    let hardware = [runs[1], runs[3]].into_iter().flatten().min();
    let faster = matches!((software, hardware), (Some(sw), Some(hw)) if hw.as_secs_f64() < sw.as_secs_f64() * HWACCEL_MARGIN);
    info!(
        hwaccel = faster,
        sw = ?software,
        hw = ?hardware,
        "storyboard decode path: {}",
        if faster { "hardware (-hwaccel auto)" } else { "software" },
    );
    match faster {
        true => Decode::Hardware,
        false => Decode::Keyframes,
    }
}

/// Grab the tiles `wanted` names with a fast keyframe seek, several in
/// parallel, writing `px_<NNNN>.png` into `scratch`. Answers which of them
/// landed: one failed seek is tolerated (it becomes black padding through
/// [`fill_gaps`]), and nothing landing at all is an error carrying the first
/// cause captured. Blocking; run it on a blocking thread.
///
/// A cell whose own second cannot be read answers nothing rather than whatever
/// the demuxer resyncs to, which over a file still arriving is minutes later.
pub fn grab_tiles(
    input: &str,
    scratch: &Path,
    plan: &Plan,
    wanted: &[u32],
    decode: Decode,
    cancel: Cancel,
) -> Result<Vec<u32>, String> {
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let next = AtomicUsize::new(0);
    let landed: Mutex<Vec<u32>> = Mutex::new(Vec::new());
    let first_err: Mutex<Option<String>> = Mutex::new(None);
    std::thread::scope(|threads| {
        for _ in 0..workers().min(wanted.len()) {
            threads.spawn(|| {
                while let Some(&index) = wanted.get(next.fetch_add(1, Ordering::Relaxed)) {
                    if cancel() {
                        break;
                    }
                    let out = scratch.join(name_of(index));
                    let cell = Cell {
                        at_s: plan.at(index),
                        within_s: plan.interval,
                    };
                    match extract_one(input, cell, &out, decode, cancel) {
                        Ok(()) => landed.lock().unwrap().push(index),
                        Err(why) => {
                            let mut held = first_err.lock().unwrap();
                            held.get_or_insert(why);
                        }
                    }
                }
            });
        }
    });
    let mut landed = landed.into_inner().unwrap();
    if landed.is_empty() {
        return Err(first_err
            .into_inner()
            .unwrap()
            .unwrap_or_else(|| "no tiles produced".to_string()));
    }
    landed.sort_unstable();
    Ok(landed)
}

/// Backfill every `px_<NNNN>.png` a seek did not produce with a black tile, so
/// the cells after it are not shifted.
pub fn fill_gaps(scratch: &Path, count: u32) {
    let missing: Vec<u32> = (0..count)
        .filter(|index| !scratch.join(name_of(*index)).exists())
        .collect();
    if missing.is_empty() {
        return;
    }
    let black = scratch.join("black.png");
    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        &format!("color=c=black:s={TILE_W}x{TILE_H}"),
        "-frames:v",
        "1",
    ])
    .arg(&black);
    if run_capturing(cmd, TILE_TIMEOUT).is_ok() && black.exists() {
        for index in missing {
            let _ = std::fs::copy(&black, scratch.join(name_of(index)));
        }
    }
}

pub(super) const TILE_PATTERN: &str = "px_%04d.png";

pub(super) fn name_of(index: u32) -> String {
    format!("px_{index:04}.png")
}

// One per core, clamped to a sane band: seeks are IO- and decode-bound, so a
// handful of workers hides the latency and past that extra processes only
// thrash shared storage.
fn workers() -> usize {
    std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4)
        .clamp(2, MAX_WORKERS)
}

#[derive(Clone, Copy)]
struct Cell {
    at_s: u32,
    within_s: u32,
}

// `-ss` before `-i` is a fast input seek: ffmpeg jumps to the GOP at `at_s`
// without decoding up to it. `-copyts` keeps the frame's own timestamp and the
// output `-to` then refuses one later than the cell: a seek into a stretch of the
// file that has not arrived resyncs forward, and that frame is somebody else's.
fn extract_one(
    input: &str,
    cell: Cell,
    out: &Path,
    decode: Decode,
    cancel: Cancel,
) -> Result<(), String> {
    let filter = format!(
        "scale={TILE_W}:{TILE_H}:force_original_aspect_ratio=increase,crop={TILE_W}:{TILE_H}"
    );
    let mut cmd = Command::new("ffmpeg");
    // `-threads 2`: the pool already runs one process per core, so a per-process
    // decoder pool only multiplies into oversubscription.
    cmd.args(["-v", "error", "-nostdin", "-threads", "2"]);
    cmd.args(decode.args());
    cmd.args(["-ss", &cell.at_s.to_string()])
        .args(["-noaccurate_seek", "-copyts", "-i"])
        .arg(input)
        .args(["-an", "-sn", "-dn", "-frames:v", "1"])
        .args(["-to", &(cell.at_s + cell.within_s).to_string()])
        .args(["-vf", &filter])
        // A ten bit source writes 16 bits a channel, and ffmpeg 8.1 laid a
        // grid of those out as a black sheet.
        .args(["-pix_fmt", "rgb24", "-y"])
        .arg(out);
    run_capturing_cancellable(cmd, TILE_TIMEOUT, cancel)?;
    match out.exists() {
        true => Ok(()),
        false => Err("ffmpeg reported success but produced no frame".to_string()),
    }
}

#[cfg(test)]
mod tests;
