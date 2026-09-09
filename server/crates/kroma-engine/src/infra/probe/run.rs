//! Invoke the `ffprobe` CLI on one file: availability check, the per-file run,
//! and what a refusal means against an extension guess.

use std::path::Path;
use std::process::Command;

use tracing::debug;

use crate::model::VideoStream;

use super::parse::build_result;
use super::ProbeResult;

const REASON_CHARS: usize = 200;

pub fn ffprobe_available() -> bool {
    Command::new("ffprobe")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Reads just the container's `format.duration`: a header read, no frame decode,
/// so it is cheap enough to call on demand. `None` when ffprobe is missing or the
/// file has no readable duration.
pub fn probe_duration_ms(path: &Path) -> Option<u64> {
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
        ])
        .arg(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let secs: f64 = String::from_utf8_lossy(&out.stdout).trim().parse().ok()?;
    (secs > 0.0).then_some((secs * 1000.0) as u64)
}

/// Best effort in one direction only: a missing ffprobe or output KROMA cannot
/// parse falls back to a container-extension guess, because neither is the
/// file's fault. A file ffprobe opened and refused comes back carrying its
/// reason and no invented streams.
pub fn probe_file(path: &Path, ffprobe_present: bool) -> ProbeResult {
    if !ffprobe_present {
        return fallback_from_extension(path);
    }
    match run_ffprobe(path) {
        Outcome::Read(result) => *result,
        Outcome::Unreadable(reason) => ProbeResult {
            unreadable: Some(reason),
            ..ProbeResult::default()
        },
        Outcome::NotProbed => fallback_from_extension(path),
    }
}

enum Outcome {
    Read(Box<ProbeResult>),
    Unreadable(String),
    NotProbed,
}

// Failures log at DEBUG, not WARN: every worker probing every file would flood
// the default log, and a wholesale degradation still shows up as `probed` ≪
// `total` in the phase-2 summary.
fn run_ffprobe(path: &Path) -> Outcome {
    let output = match Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            debug!(file = %path.display(), error = %e, "ffprobe failed to spawn; using extension guess");
            return Outcome::NotProbed;
        }
    };
    outcome_of(path, output.status.code(), &output.stdout, &output.stderr)
}

fn outcome_of(path: &Path, exit_code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Outcome {
    if exit_code != Some(0) {
        let reason = failure_reason(path, exit_code, stderr);
        debug!(file = %path.display(), code = exit_code.unwrap_or(-1), %reason, "ffprobe refused the file");
        return Outcome::Unreadable(reason);
    }
    match serde_json::from_slice(stdout) {
        Ok(parsed) => Outcome::Read(Box::new(build_result(parsed))),
        Err(e) => {
            debug!(file = %path.display(), error = %e, "failed to parse ffprobe JSON; using extension guess");
            Outcome::NotProbed
        }
    }
}

fn failure_reason(path: &Path, exit_code: Option<i32>, stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    // The reason reaches clients, which are never told a file's absolute path.
    let prefix = format!("{}: ", path.display());
    let said = text
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.strip_prefix(prefix.as_str()).unwrap_or(line))
        .unwrap_or_default();
    if said.is_empty() {
        return match exit_code {
            Some(code) => format!("ffprobe exited with status {code}"),
            None => "ffprobe was killed before it answered".to_string(),
        };
    }
    said.chars().take(REASON_CHARS).collect()
}

fn fallback_from_extension(path: &Path) -> ProbeResult {
    let ext = path
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();

    let codec = match ext.as_str() {
        "webm" => "vp9",
        "avi" => "mpeg4",
        "mp4" | "m4v" | "mov" | "mkv" | "ts" => "h264",
        _ => "unknown",
    };

    ProbeResult {
        video: Some(VideoStream {
            codec: codec.to_string(),
            width: None,
            height: None,
            hdr: false,
            bit_depth: None,
        }),
        ..ProbeResult::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reason_of(outcome: Outcome) -> String {
        match outcome {
            Outcome::Unreadable(reason) => reason,
            Outcome::Read(_) => panic!("a refusal must not read as a description"),
            Outcome::NotProbed => panic!("a refusal must not read as a missing probe"),
        }
    }

    #[test]
    fn a_file_ffprobe_refuses_is_unreadable_and_keeps_ffprobes_own_reason() {
        let path = Path::new("/media/Dune (2021)/dune.mkv");
        let stderr = b"/media/Dune (2021)/dune.mkv: Invalid data found when processing input\n";

        let reason = reason_of(outcome_of(path, Some(1), b"", stderr));

        assert_eq!(reason, "Invalid data found when processing input");
    }

    #[test]
    fn the_reason_never_carries_the_path_the_client_is_not_shown() {
        let path = Path::new("/srv/media/private/x.mkv");
        let stderr = b"/srv/media/private/x.mkv: moov atom not found\n";

        let reason = reason_of(outcome_of(path, Some(1), b"", stderr));

        assert!(!reason.contains("/srv/media"), "{reason}");
    }

    #[test]
    fn a_refusal_with_nothing_to_say_still_names_the_status_it_failed_with() {
        let path = Path::new("/media/x.mkv");

        assert_eq!(
            reason_of(outcome_of(path, Some(183), b"", b"  \n")),
            "ffprobe exited with status 183"
        );
        assert_eq!(
            reason_of(outcome_of(path, None, b"", b"")),
            "ffprobe was killed before it answered"
        );
    }

    #[test]
    fn a_reason_longer_than_the_cap_is_cut_to_it() {
        let path = Path::new("/media/x.mkv");
        let stderr = "e".repeat(REASON_CHARS * 2).into_bytes();

        let reason = reason_of(outcome_of(path, Some(1), b"", &stderr));

        assert_eq!(reason.chars().count(), REASON_CHARS);
    }

    #[test]
    fn output_kroma_cannot_parse_is_not_the_files_fault() {
        let outcome = outcome_of(Path::new("/media/x.mkv"), Some(0), b"not json", b"");

        assert!(matches!(outcome, Outcome::NotProbed));
    }

    #[test]
    fn a_described_file_comes_back_with_its_streams_and_no_fault() {
        let stdout = br#"{"streams":[{"codec_type":"video","codec_name":"hevc","width":3840,"height":2160}]}"#;

        let outcome = outcome_of(Path::new("/media/x.mkv"), Some(0), stdout, b"");

        let Outcome::Read(result) = outcome else {
            panic!("a parsable description must read as one");
        };
        assert_eq!(result.video.as_ref().map(|v| v.codec.as_str()), Some("hevc"));
        assert!(result.unreadable.is_none());
    }

    #[test]
    fn without_ffprobe_the_container_extension_still_names_a_codec() {
        let guessed = probe_file(Path::new("/media/x.webm"), false);

        assert_eq!(guessed.video.map(|v| v.codec), Some("vp9".to_string()));
        assert!(guessed.unreadable.is_none());
    }

    #[test]
    fn a_container_nothing_recognises_guesses_nothing() {
        let guessed = probe_file(Path::new("/media/x.bin"), false);

        assert_eq!(guessed.video.map(|v| v.codec), Some("unknown".to_string()));
    }
}
