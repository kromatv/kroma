//! Audio-fingerprint intro/credits detection (Jellyfin "Intro Skipper" style).
//!
//! `ffmpeg` decodes a window of mono PCM, `rusty-chromaprint` turns it into a
//! Chromaprint fingerprint, and the crate's `match_fingerprints` aligns two
//! episodes to surface the run they share: the intro (near the start of the file)
//! or the recurring credits theme (near the end). No external `fpcalc` binary: we
//! already ship `ffmpeg` and fingerprint in-process.

use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};
use rusty_chromaprint::{match_fingerprints, Configuration, Fingerprinter};

/// Keep only well-aligned segments. `Segment::score` is 0 (identical) … 32 (worst).
const MAX_SCORE: f64 = 10.0;

/// Chromaprint config (preset_test1 ≈ standard fpcalc). Cheap to build.
pub fn config() -> Configuration {
    Configuration::preset_test1()
}

/// A fingerprint plus where its window began in the file (seconds), so a match's
/// in-window time can be mapped back to an absolute position.
pub struct WindowFp {
    pub data: Vec<u32>,
    pub window_start_s: f64,
}

/// Decode `secs` of mono PCM from `path` and fingerprint it. `from_end` takes the
/// last `secs` (credits) instead of the first (intro). `duration_s` anchors the
/// end window in absolute time.
pub fn fingerprint_window(
    path: &Path,
    secs: u32,
    from_end: bool,
    duration_s: f64,
) -> Result<WindowFp> {
    let cfg = config();
    let sr = cfg.sample_rate();
    let mut cmd = Command::new("ffmpeg");
    // Audio-only decode is single-stream work; cap the decoder pool so marker
    // jobs never fan out threads across every core.
    cmd.args(["-v", "error", "-nostdin", "-threads", "1"]);
    if from_end {
        cmd.arg("-sseof").arg(format!("-{secs}"));
    }
    cmd.arg("-i").arg(path);
    if !from_end {
        cmd.arg("-t").arg(secs.to_string());
    }
    cmd.args(["-vn", "-ac", "1", "-ar"])
        .arg(sr.to_string())
        .args(["-f", "s16le", "-"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // Share the process-wide ffmpeg budget (see `infra::ffmpeg_gate`); the permit
    // is held only for the decode and dropped as this block ends.
    let out = {
        let _permit = crate::infra::ffmpeg_gate::acquire();
        cmd.output().context("spawn ffmpeg for fingerprint")?
    };
    if !out.status.success() {
        bail!("ffmpeg exited with {}", out.status);
    }
    let samples: Vec<i16> = out
        .stdout
        .chunks_exact(2)
        .map(|b| i16::from_le_bytes([b[0], b[1]]))
        .collect();
    if samples.is_empty() {
        bail!("no audio decoded from {}", path.display());
    }

    let mut fp = Fingerprinter::new(&cfg);
    fp.start(sr, 1).map_err(|e| anyhow::anyhow!("fingerprinter start: {e:?}"))?;
    fp.consume(&samples);
    fp.finish();
    Ok(WindowFp {
        data: fp.fingerprint().to_vec(),
        window_start_s: if from_end { (duration_s - secs as f64).max(0.0) } else { 0.0 },
    })
}

/// The (start, end) seconds **within `a`'s window** of the longest well-aligned
/// segment shared by `a` and `b` whose start lies in `region` and that is at least
/// `min_len_s` long. `None` if nothing qualifies.
pub fn matched_range(
    a: &[u32],
    b: &[u32],
    region: (f32, f32),
    min_len_s: f32,
) -> Option<(f32, f32)> {
    let cfg = config();
    let segments = match_fingerprints(a, b, &cfg).ok()?;
    let ranges: Vec<(f32, f32)> = segments
        .iter()
        .filter(|s| s.score <= MAX_SCORE)
        .map(|s| (s.start1(&cfg), s.end1(&cfg)))
        .collect();
    pick_range(&ranges, region, min_len_s)
}

/// Pure: from candidate `(start, end)` ranges, keep those starting in `region` and
/// at least `min_len_s` long; return the longest. Separated out for testing.
pub fn pick_range(ranges: &[(f32, f32)], region: (f32, f32), min_len_s: f32) -> Option<(f32, f32)> {
    ranges
        .iter()
        .copied()
        .filter(|(s, e)| *s >= region.0 && *s <= region.1 && (e - s) >= min_len_s)
        .max_by(|x, y| (x.1 - x.0).partial_cmp(&(y.1 - y.0)).unwrap_or(std::cmp::Ordering::Equal))
}

/// Pure: consensus of per-pair ranges: the median range, accepted only if at
/// least `min_support` of the candidates start within 3 s of it. `None` otherwise.
/// Guards against one anomalous episode producing a spurious marker.
pub fn consensus(mut ranges: Vec<(f32, f32)>, min_support: usize) -> Option<(f32, f32)> {
    if ranges.len() < min_support.max(1) {
        return None;
    }
    ranges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let (ms, me) = ranges[ranges.len() / 2];
    let support = ranges.iter().filter(|(s, _)| (s - ms).abs() <= 3.0).count();
    (support >= min_support.max(1)).then_some((ms, me))
}

/// Convert an in-window `secs` offset to an absolute position in ms.
pub fn abs_ms(window_start_s: f64, secs: f32) -> u64 {
    ((window_start_s + secs as f64) * 1000.0).max(0.0) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_range_filters_region_and_length_then_longest() {
        let ranges = [
            (0.5, 5.0),   // too short (4.5 s)
            (2.0, 20.0),  // 18 s, in region → candidate
            (2.5, 30.0),  // 27.5 s, in region → longest
            (400.0, 460.0), // outside region
        ];
        assert_eq!(pick_range(&ranges, (0.0, 60.0), 10.0), Some((2.5, 30.0)));
        // Tighter min length drops everything.
        assert_eq!(pick_range(&ranges, (0.0, 60.0), 40.0), None);
        // Region excludes the early starts.
        assert_eq!(pick_range(&ranges, (300.0, 500.0), 10.0), Some((400.0, 460.0)));
    }

    #[test]
    fn consensus_needs_support() {
        let agree = vec![(1.0, 90.0), (1.5, 91.0), (2.0, 89.0)];
        assert_eq!(consensus(agree, 2), Some((1.5, 91.0)));
        // Scattered starts → no consensus.
        assert_eq!(consensus(vec![(1.0, 90.0), (40.0, 130.0)], 2), None);
        // Too few candidates.
        assert_eq!(consensus(vec![(1.0, 90.0)], 2), None);
    }

    #[test]
    fn abs_ms_anchors_to_window() {
        assert_eq!(abs_ms(0.0, 12.0), 12_000); // intro window starts at 0
        assert_eq!(abs_ms(1200.0, 15.0), 1_215_000); // end window offset added
    }
    // ----- matched_range over synthetic fingerprints -------------------------------
    //
    // A fingerprint is just a `Vec<u32>`; it does not have to come from audio, so
    // the matcher can be driven without ffmpeg or a media file.

    /// A fingerprint long enough for the matcher to align, deterministic so the
    /// test cannot drift.
    fn synthetic_fp(len: usize, seed: u32) -> Vec<u32> {
        // A simple LCG: reproducible, and varied enough that two different seeds
        // do not accidentally align.
        let mut x = seed.wrapping_mul(2_654_435_761).wrapping_add(1);
        (0..len)
            .map(|_| {
                x = x.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                x
            })
            .collect()
    }

    #[test]
    fn the_chromaprint_config_is_the_fpcalc_preset() {
        // The stored fingerprints are only comparable to each other under the
        // SAME configuration; changing this silently invalidates every marker
        // already computed.
        let cfg = config();
        assert_eq!(cfg.sample_rate(), Configuration::preset_test1().sample_rate());
    }

    #[test]
    fn a_fingerprint_matched_against_itself_covers_its_whole_length() {
        // The degenerate case that proves the plumbing: identical audio aligns
        // perfectly, so the match should span essentially the whole window.
        let fp = synthetic_fp(600, 1);
        let got = matched_range(&fp, &fp, (0.0, 600.0), 1.0).expect("identical input must match");
        assert!(got.0 < 1.0, "the match should start at the beginning, got {got:?}");
        assert!(got.1 - got.0 > 30.0, "the match should be long, got {got:?}");
    }

    #[test]
    fn a_match_outside_the_region_of_interest_is_not_returned() {
        // The intro search only looks at the first minutes; a strong match later
        // in the file is somebody else's marker.
        let fp = synthetic_fp(600, 1);
        assert_eq!(matched_range(&fp, &fp, (500.0, 600.0), 1.0), None);
    }

    #[test]
    fn a_match_shorter_than_the_floor_is_not_a_marker() {
        // A two-second coincidence is not an intro.
        let fp = synthetic_fp(600, 1);
        assert_eq!(matched_range(&fp, &fp, (0.0, 600.0), 10_000.0), None);
    }

    /// `a` with `bits` bits flipped in every value: the shape of the same intro
    /// re-encoded at a different bitrate. Aligns, but not perfectly.
    fn noisy(a: &[u32], bits: u32) -> Vec<u32> {
        let mask = (1u32 << bits) - 1;
        a.iter().map(|v| v ^ mask).collect()
    }

    #[test]
    fn a_heavily_corrupted_fingerprint_yields_no_marker() {
        // The same intro re-encoded badly enough stops matching at all.
        //
        // Note what this does NOT show: raising MAX_SCORE to 1000 still passes
        // it, because chromaprint returns no segment here rather than a
        // high-scoring one. The score floor's UPPER side is not reachable with
        // synthetic fingerprints - it would need two real recordings of the same
        // intro - so nothing here pins it, and the comment says so instead of the
        // test implying otherwise.
        let a = synthetic_fp(600, 1);
        assert_eq!(matched_range(&a, &noisy(&a, 24), (0.0, 600.0), 10.0), None);
    }

    #[test]
    fn two_unrelated_fingerprints_do_not_produce_a_marker() {
        // The false-positive case that matters: two episodes with no shared
        // intro must yield nothing, or every show grows a spurious skip button.
        let a = synthetic_fp(600, 1);
        let b = synthetic_fp(600, 999);
        assert_eq!(matched_range(&a, &b, (0.0, 600.0), 10.0), None);
    }

    #[test]
    fn an_empty_fingerprint_is_handled_rather_than_panicking() {
        // A decode that produced no audio (a video-only file) reaches here as an
        // empty vector.
        assert_eq!(matched_range(&[], &[], (0.0, 600.0), 1.0), None);
        let fp = synthetic_fp(600, 1);
        assert_eq!(matched_range(&fp, &[], (0.0, 600.0), 1.0), None);
    }
}
