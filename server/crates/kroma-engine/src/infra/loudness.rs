//! EBU R128 loudness measurement via ffmpeg's `ebur128` filter (decode + meter,
//! never transcodes). One pass over the file measures the full mix; for 5.1+
//! tracks the same decode also measures the centre channel alone (where
//! dialogue lives) through an `asplit` fork, so the file is read once.

use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};
use kroma_domain::{AudioAnalysis, AudioVerdict};
use kroma_media::ffmpeg_gate::Footprint;
use kroma_media::input;

// LRA above this (LU) = the "quiet dialogue, loud explosions" mix.
const LRA_HIGH: f64 = 15.0;
// Centre channel this far below the full mix (LU) = dialogue is buried.
const DIALOG_GAP: f64 = 8.0;

/// One `ebur128` summary: integrated loudness (LUFS), loudness range (LU) and
/// true peak (dBTP).
#[derive(Debug, Clone, Copy)]
pub struct LoudnessStats {
    pub integrated: f64,
    pub range: f64,
    pub true_peak: f64,
}

/// Full-mix measurement plus, for 5.1+ tracks, the centre channel alone.
#[derive(Debug, Clone, Copy)]
pub struct LoudnessResult {
    pub mix: LoudnessStats,
    pub dialog: Option<LoudnessStats>,
}

const MIX_METER: &str = "ebur128=peak=true:framelog=verbose";
const CENTRE_METER: &str = "ebur128=framelog=verbose";

/// Measure the loudness of audio track `audio_rel` (audio-relative index) of
/// `path`. `channels` decides whether a centre-channel measurement is worth
/// forking off (5.1 and up). Audio-only decode, gated on the process-wide
/// ffmpeg budget.
pub fn measure(path: &Path, audio_rel: u32, channels: Option<u32>) -> Result<LoudnessResult> {
    let stderr = run_meters(path, &meter_args(audio_rel, channels))?;
    let mut summaries = parse_summaries(&stderr);
    summaries.sort_by_key(|(idx, _)| *idx);
    let mut readings = summaries.into_iter().map(|(_, stats)| stats);
    let Some(mix) = readings.next() else {
        bail!("no ebur128 summary in ffmpeg output for {}", path.display());
    };
    Ok(LoudnessResult {
        mix,
        dialog: readings.next(),
    })
}

// The graph is built mix-first, so the mix meter always has the LOWER filter
// index: summaries are matched by index, not print order (ffmpeg flushes them
// in nondeterministic order).
fn meter_args(audio_rel: u32, channels: Option<u32>) -> Vec<String> {
    let (graph, outputs): (String, &[&str]) = if channels.is_some_and(|c| c >= 5) {
        (
            format!("[0:a:{audio_rel}]asplit=2[full][c];[full]{MIX_METER}[fo];[c]pan=mono|c0=FC,{CENTRE_METER}[co]"),
            &["[fo]", "[co]"],
        )
    } else {
        (format!("[0:a:{audio_rel}]{MIX_METER}[fo]"), &["[fo]"])
    };
    let mut args = vec!["-filter_complex".to_owned(), graph];
    for output in outputs {
        args.extend(["-map", output, "-f", "null", "-"].map(str::to_owned));
    }
    args
}

fn run_meters(path: &Path, meter_args: &[String]) -> Result<String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-nostats", "-nostdin"]);
    cmd.args(["-v", "info", "-threads", "1"]);
    cmd.args(input::file(path));
    cmd.args(meter_args);
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());
    let out = {
        let _permit = kroma_media::ffmpeg_gate::acquire(Footprint::LIGHT);
        cmd.output()
            .context("spawn ffmpeg for loudness measurement")?
    };
    if !out.status.success() {
        bail!("ffmpeg loudness pass exited with {}", out.status);
    }
    Ok(String::from_utf8_lossy(&out.stderr).into_owned())
}

fn parse_summaries(stderr: &str) -> Vec<(u32, LoudnessStats)> {
    let mut out: Vec<(u32, LoudnessStats)> = Vec::new();
    for line in stderr.lines() {
        if let Some(idx) = summary_index(line) {
            out.push((idx, LoudnessStats::SILENT));
        } else if let Some((_, stats)) = out.last_mut() {
            stats.read(line);
        }
    }
    out
}

fn summary_index(line: &str) -> Option<u32> {
    let (_, tail) = line.split_once("[Parsed_ebur128_")?;
    let (idx, rest) = tail.split_once(' ')?;
    if !rest.trim_end().ends_with("Summary:") {
        return None;
    }
    idx.parse().ok()
}

impl LoudnessStats {
    // Silence reads as -70 LUFS and a -inf peak; the floors keep every value
    // finite, so it stays storable and JSON-serializable.
    const SILENT: Self = Self {
        integrated: -70.0,
        range: 0.0,
        true_peak: -99.0,
    };

    fn read(&mut self, line: &str) {
        let Some((key, value)) = line.split_once(':') else {
            return;
        };
        let Some(x) = value
            .split_whitespace()
            .next()
            .and_then(|v| v.parse::<f64>().ok())
            .filter(|x| x.is_finite())
        else {
            return;
        };
        match key.trim() {
            "I" => self.integrated = x,
            "LRA" => self.range = x,
            "Peak" => self.true_peak = x,
            _ => {}
        }
    }
}

pub fn to_analysis(res: &LoudnessResult) -> AudioAnalysis {
    let dialog_lufs = res.dialog.map(|d| d.integrated);
    AudioAnalysis {
        lufs_i: res.mix.integrated,
        lra: res.mix.range,
        true_peak: res.mix.true_peak,
        dialog_lufs,
        verdict: verdict(res.mix.integrated, res.mix.range, dialog_lufs),
    }
}

// Buried dialogue outranks plain wide dynamics: it is the more actionable
// finding (the boost suggestion names dialogue explicitly).
fn verdict(mix_i: f64, lra: f64, dialog_i: Option<f64>) -> AudioVerdict {
    if let Some(d) = dialog_i {
        // A fully silent centre (-70 floor) means the "5.1" carries no real
        // dialogue channel; that's not a dialogue problem, skip the check.
        if d > -69.0 && mix_i - d > DIALOG_GAP {
            return AudioVerdict::QuietDialog;
        }
    }
    if lra > LRA_HIGH {
        return AudioVerdict::HighDynamics;
    }
    AudioVerdict::Ok
}

#[cfg(test)]
mod tests {
    use super::*;

    const SURROUND: &str = r#"
[Parsed_ebur128_3 @ 0x7cbac14f00] Summary:

  Integrated loudness:
    I:         -26.8 LUFS
    Threshold: -36.8 LUFS

  Loudness range:
    LRA:         0.1 LU
    Threshold: -46.8 LUFS
    LRA low:   -26.8 LUFS
    LRA high:  -26.7 LUFS
[Parsed_ebur128_1 @ 0x7cbac14d80] Summary:

  Integrated loudness:
    I:         -19.1 LUFS
    Threshold: -29.1 LUFS

  Loudness range:
    LRA:        16.4 LU
    Threshold: -39.1 LUFS
    LRA low:   -29.2 LUFS
    LRA high:  -12.8 LUFS

  True peak:
    Peak:      -11.6 dBFS
[out#0/null @ 0x7cbac14240] video:0KiB audio:337497KiB subtitle:0KiB other streams:0KiB
"#;

    const SILENCE: &str = r#"
[Parsed_ebur128_0 @ 0x79b5029080] Summary:

  Integrated loudness:
    I:         -70.0 LUFS
    Threshold:   0.0 LUFS

  Loudness range:
    LRA:         0.0 LU
    Threshold:   0.0 LUFS
    LRA low:     0.0 LUFS
    LRA high:    0.0 LUFS

  True peak:
    Peak:       -inf dBFS
"#;

    fn sorted(stderr: &str) -> Vec<(u32, LoudnessStats)> {
        let mut summaries = parse_summaries(stderr);
        summaries.sort_by_key(|(idx, _)| *idx);
        summaries
    }

    #[test]
    fn the_mix_sorts_first_whatever_order_ffmpeg_printed_it_in() {
        let summaries = sorted(SURROUND);

        assert_eq!(
            summaries.iter().map(|(idx, _)| *idx).collect::<Vec<_>>(),
            [1, 3]
        );
        assert!((summaries[0].1.integrated - -19.1).abs() < 1e-9);
        assert!((summaries[1].1.integrated - -26.8).abs() < 1e-9);
    }

    #[test]
    fn a_summary_reads_its_range_and_true_peak_but_not_the_thresholds() {
        let summaries = sorted(SURROUND);

        let mix = summaries[0].1;
        assert!((mix.range - 16.4).abs() < 1e-9);
        assert!((mix.true_peak - -11.6).abs() < 1e-9);
    }

    #[test]
    fn a_silent_track_keeps_finite_floors() {
        let summaries = parse_summaries(SILENCE);

        assert_eq!(summaries.len(), 1);
        assert!((summaries[0].1.integrated - -70.0).abs() < 1e-9);
        assert!((summaries[0].1.true_peak - -99.0).abs() < 1e-9);
    }

    #[test]
    fn output_with_no_summary_reads_nothing() {
        let stderr = "[Parsed_ebur128_0 @ 0x0] t: 0.1  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS\n";

        assert!(parse_summaries(stderr).is_empty());
    }

    #[test]
    fn verdict_policy() {
        assert_eq!(verdict(-23.0, 9.0, Some(-25.0)), AudioVerdict::Ok);
        assert_eq!(verdict(-23.0, 18.5, None), AudioVerdict::HighDynamics);
        assert_eq!(verdict(-9.0, 18.5, Some(-31.6)), AudioVerdict::QuietDialog);
        assert_eq!(verdict(-23.0, 9.0, Some(-70.0)), AudioVerdict::Ok);
    }
}
