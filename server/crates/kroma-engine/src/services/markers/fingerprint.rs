//! Audio-fingerprint intro/credits detection (Jellyfin "Intro Skipper" style).
//!
//! `ffmpeg` decodes a window of mono PCM, `rusty-chromaprint` turns it into a
//! Chromaprint fingerprint, and the crate's `match_fingerprints` aligns two
//! episodes to surface the run they share: the intro (near the start of the file)
//! or the recurring credits theme (near the end). No external `fpcalc` binary: we
//! already ship `ffmpeg` and fingerprint in-process.

use std::ffi::OsString;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};
use rusty_chromaprint::{match_fingerprints, Configuration, Fingerprinter};

// Keep only well-aligned segments. `Segment::score` is 0 (identical) … 32 (worst).
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
    cmd.args(decode_args(path, secs, from_end, sr))
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
    let samples = samples_from_pcm(&out.stdout);
    if samples.is_empty() {
        bail!("no audio decoded from {}", path.display());
    }

    let mut fp = Fingerprinter::new(&cfg);
    fp.start(sr, 1).map_err(|e| anyhow::anyhow!("fingerprinter start: {e:?}"))?;
    fp.consume(&samples);
    fp.finish();
    Ok(WindowFp {
        data: fp.fingerprint().to_vec(),
        window_start_s: window_start_s(secs, from_end, duration_s),
    })
}

// Seeking to the wrong end, or a sample rate that disagrees with the Chromaprint
// config, fails SILENTLY: wrong markers or fingerprints that never align, with
// no error anywhere.
fn decode_args(path: &Path, secs: u32, from_end: bool, sample_rate: u32) -> Vec<OsString> {
    let mut args: Vec<OsString> = Vec::new();
    // Audio-only decode is single-stream work; cap the decoder pool so marker
    // jobs never fan out threads across every core.
    args.extend(["-v", "error", "-nostdin", "-threads", "1"].map(OsString::from));
    // `-sseof` is an INPUT option: it has to come before `-i` or ffmpeg applies
    // it to the output and reads the file from the start.
    if from_end {
        args.push(OsString::from("-sseof"));
        args.push(OsString::from(format!("-{secs}")));
    }
    args.push(OsString::from("-i"));
    args.push(path.as_os_str().to_os_string());
    // The end window is already bounded by the seek; `-t` there would cut it.
    if !from_end {
        args.push(OsString::from("-t"));
        args.push(OsString::from(secs.to_string()));
    }
    args.extend(["-vn", "-ac", "1", "-ar"].map(OsString::from));
    args.push(OsString::from(sample_rate.to_string()));
    args.extend(["-f", "s16le", "-"].map(OsString::from));
    args
}

// A trailing odd byte is a truncated sample and is dropped rather than read
// past the end of the buffer.
fn samples_from_pcm(bytes: &[u8]) -> Vec<i16> {
    bytes.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect()
}

// Clamped at zero: an episode shorter than the credits window would otherwise
// anchor at a negative time and push every marker before the start of the file.
fn window_start_s(secs: u32, from_end: bool, duration_s: f64) -> f64 {
    if from_end {
        (duration_s - f64::from(secs)).max(0.0)
    } else {
        0.0
    }
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
    fn args(secs: u32, from_end: bool) -> Vec<String> {
        decode_args(Path::new("/media/ep.mkv"), secs, from_end, 11025)
            .into_iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect()
    }

    fn at(args: &[String], flag: &str) -> Option<usize> {
        args.iter().position(|a| a == flag)
    }

    #[test]
    fn the_intro_window_reads_the_first_seconds() {
        let a = args(30, false);
        assert!(at(&a, "-sseof").is_none(), "the start window must not seek: {a:?}");
        let t = at(&a, "-t").expect("bounded by -t");
        assert_eq!(a[t + 1], "30");
    }

    #[test]
    fn the_credits_window_seeks_from_the_end_instead_of_bounding_the_duration() {
        // `-t 30` after a `-sseof -30` would cut the window at the file's own
        // end anyway, but the seek is what makes it the LAST thirty seconds.
        let a = args(30, true);
        let s = at(&a, "-sseof").expect("seeks from the end");
        assert_eq!(a[s + 1], "-30");
        assert!(at(&a, "-t").is_none(), "the end window is bounded by the seek: {a:?}");
    }

    #[test]
    fn the_seek_precedes_the_input() {
        // `-sseof` is an INPUT option. After `-i` ffmpeg applies it to the
        // output and reads the file from the start - the credits fingerprint
        // would then be of the intro, and every credits marker would be wrong.
        let a = args(30, true);
        assert!(at(&a, "-sseof").unwrap() < at(&a, "-i").unwrap(), "{a:?}");
    }

    #[test]
    fn the_decode_matches_what_chromaprint_was_configured_for() {
        // Mono, and at the configuration's own sample rate. A mismatch does not
        // error: it produces fingerprints that never align with each other, so
        // the detector silently finds no intro in any show.
        let a = args(30, false);
        let ac = at(&a, "-ac").unwrap();
        assert_eq!(a[ac + 1], "1");
        let ar = at(&a, "-ar").unwrap();
        assert_eq!(a[ar + 1], "11025");
        assert_eq!(a[ar + 1], config().sample_rate().to_string());
        // Raw little-endian s16 on stdout, which is what `samples_from_pcm` reads.
        assert_eq!(a[at(&a, "-f").unwrap() + 1], "s16le");
        assert_eq!(a.last().unwrap(), "-");
    }

    #[test]
    fn video_is_dropped_and_the_decoder_stays_on_one_thread() {
        // The marker pass already runs several episodes at once; letting each
        // decode fan out across every core is how it starves playback.
        let a = args(30, false);
        assert!(a.contains(&"-vn".to_string()), "{a:?}");
        assert_eq!(a[at(&a, "-threads").unwrap() + 1], "1");
    }

    #[test]
    fn the_file_is_passed_through_untouched() {
        // Paths with spaces or non-UTF-8 bytes reach ffmpeg as-is; building the
        // argv as strings would mangle them.
        let a = decode_args(Path::new("/media/Le Fabuleux Destin.mkv"), 30, false, 11025);
        assert!(a.iter().any(|x| x == "/media/Le Fabuleux Destin.mkv"), "{a:?}");
    }

    #[test]
    fn a_file_with_no_decodable_audio_fails_instead_of_fingerprinting_silence() {
        let dir = kroma_testing::temp_dir("fingerprint");
        let broken = dir.path().join("not-media.mkv");
        std::fs::write(&broken, b"this is not a container").unwrap();

        assert!(fingerprint_window(&broken, 30, false, 1800.0).is_err());
        assert!(fingerprint_window(&broken, 30, true, 1800.0).is_err());
        assert!(fingerprint_window(&dir.path().join("absent.mkv"), 30, false, 1800.0).is_err());
    }

    #[test]
    fn samples_are_read_little_endian() {
        // ffmpeg writes s16le; reading it big-endian yields plausible-looking
        // noise that fingerprints to nothing in common.
        assert_eq!(samples_from_pcm(&[0x01, 0x00, 0x00, 0x80]), [1, -32768]);
    }

    #[test]
    fn a_truncated_trailing_byte_is_dropped_rather_than_read_past() {
        assert_eq!(samples_from_pcm(&[0x01, 0x00, 0x7f]), [1]);
        assert!(samples_from_pcm(&[0x7f]).is_empty());
        assert!(samples_from_pcm(&[]).is_empty());
    }

    #[test]
    fn the_intro_window_is_anchored_at_the_start_of_the_file() {
        assert_eq!(window_start_s(30, false, 1800.0), 0.0);
    }

    #[test]
    fn the_credits_window_is_anchored_that_far_from_the_end() {
        assert_eq!(window_start_s(30, true, 1800.0), 1770.0);
    }

    #[test]
    fn an_episode_shorter_than_the_window_still_anchors_at_zero() {
        // A ten-second clip with a thirty-second credits window would otherwise
        // anchor at -20s and put every marker before the start of the file.
        assert_eq!(window_start_s(30, true, 10.0), 0.0);
    }

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

    // A fingerprint is just a `Vec<u32>`; the matcher can be driven with
    // synthetic data, without ffmpeg or a media file.

    // Deterministic so the test cannot drift.
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

    // The shape of the same intro re-encoded at a different bitrate: aligns, but
    // not perfectly.
    fn noisy(a: &[u32], bits: u32) -> Vec<u32> {
        let mask = (1u32 << bits) - 1;
        a.iter().map(|v| v ^ mask).collect()
    }

    #[test]
    fn a_heavily_corrupted_fingerprint_yields_no_marker() {
        // This does NOT pin MAX_SCORE's upper bound: chromaprint returns no
        // segment here (not a high-scoring one), and testing that needs real audio.
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
