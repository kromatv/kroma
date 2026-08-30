//! Which device this host actually has, and why it does not have the others.
//!
//! Listing an encoder proves nothing: `h264_vaapi` appears in every build
//! configured with VAAPI whether or not the box has a driver, a render node, or
//! permission to open one. A device that is present, listed and unusable is
//! indistinguishable from no device at all unless something says so out loud, so
//! every candidate is made to encode three frames before it is believed, and the
//! sentence explaining the outcome is kept for the log and the admin.

use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

use super::super::ffmpeg::ffmpeg_output;
use super::super::naming::contains;
use super::{render_node, HwAccel};

const VALIDATE_TIMEOUT: Duration = Duration::from_secs(20);
// Three frames of nothing: enough to open the device, allocate its surfaces and
// get a packet back, which is every step that fails when a driver is missing.
const TEST_SOURCE: &str = "color=c=black:s=320x240:r=25";

/// The pipeline the host settled on, and the sentence explaining it. The reason
/// is the whole point: "software" with no explanation is the shape a missing
/// driver, an unreadable render node and a genuinely device-less box all take.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Detection {
    pub accel: HwAccel,
    pub reason: String,
}

static DETECTED: OnceLock<Detection> = OnceLock::new();

/// The best pipeline this host offers, probed once. Override with
/// `KROMA_HWACCEL=<label>`, which is how an operator picks between two devices
/// or pins the software path to rule it out of a problem.
pub fn detect() -> HwAccel {
    detected().accel
}

/// [`detect`] with the sentence that explains it.
pub fn detected() -> &'static Detection {
    DETECTED.get_or_init(run)
}

/// Probe now rather than on the first frame anyone asks for. The validation
/// encodes shell out, and the alternative is paying for them inside the request
/// that starts a session.
pub fn prime() {
    let d = detected();
    if d.accel.is_device() {
        tracing::info!(accel = d.accel.label(), reason = %d.reason, "video re-encodes run on hardware");
    } else {
        tracing::warn!(reason = %d.reason, "video re-encodes run on the CPU");
    }
}

fn run() -> Detection {
    if let Some(accel) = pinned() {
        return Detection {
            accel,
            reason: format!("pinned by KROMA_HWACCEL={}", accel.label()),
        };
    }
    let encoders = ffmpeg_output(&["-hide_banner", "-encoders"]);
    let listed = candidates(&encoders);
    if listed.is_empty() {
        return Detection {
            accel: HwAccel::Software,
            reason: "this ffmpeg build lists no hardware H.264 encoder \
                     (h264_qsv, h264_vaapi, h264_nvenc, h264_videotoolbox)"
                .to_owned(),
        };
    }
    let mut refused = Vec::new();
    for accel in listed {
        match usable(accel) {
            Ok(()) => {
                return Detection {
                    accel,
                    reason: format!("{} encoded a test frame", encoder_of(accel)),
                }
            }
            Err(why) => refused.push(format!("{}: {why}", accel.label())),
        }
    }
    Detection {
        accel: HwAccel::Software,
        reason: format!("every listed device refused a test encode ({})", refused.join("; ")),
    }
}

fn pinned() -> Option<HwAccel> {
    match std::env::var("KROMA_HWACCEL").ok().as_deref()? {
        "videotoolbox" => Some(HwAccel::VideoToolbox),
        "qsv" => Some(HwAccel::Qsv),
        "vaapi" => Some(HwAccel::Vaapi),
        "nvenc" => Some(HwAccel::Nvenc),
        "software" | "none" => Some(HwAccel::Software),
        _ => None,
    }
}

// Ordered by how little the host has to be trusted for it to work: an Apple
// block is always there and always right; QSV beats VAAPI on the Intel parts
// that have both; NVENC needs a card the encoder list alone does not prove.
fn candidates(encoders: &[u8]) -> Vec<HwAccel> {
    let has = |accel: HwAccel| contains(encoders, encoder_of(accel).as_bytes());
    let mut out = Vec::new();
    if cfg!(target_os = "macos") && has(HwAccel::VideoToolbox) {
        out.push(HwAccel::VideoToolbox);
    }
    for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
        if has(accel) {
            out.push(accel);
        }
    }
    out
}

const fn encoder_of(accel: HwAccel) -> &'static str {
    match accel {
        HwAccel::VideoToolbox => "h264_videotoolbox",
        HwAccel::Qsv => "h264_qsv",
        HwAccel::Vaapi => "h264_vaapi",
        HwAccel::Nvenc => "h264_nvenc",
        HwAccel::Software => "libx264",
    }
}

// The render node is opened here rather than left to ffmpeg because the failure
// an operator has to act on - the service user is not in the group that owns it -
// is otherwise buried in a driver's own error text.
fn openable(node: &str) -> Result<(), String> {
    if !Path::new(node).exists() {
        return Err(format!("{node} does not exist"));
    }
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(node)
        .map(|_| ())
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::PermissionDenied => format!(
                "{node} is not readable by this user (on DSM, the package user must \
                 join the `videodriver` group; in Docker, pass --device {node})"
            ),
            _ => format!("{node} could not be opened: {e}"),
        })
}

fn usable(accel: HwAccel) -> Result<(), String> {
    let node = render_node();
    if matches!(accel, HwAccel::Qsv | HwAccel::Vaapi) {
        openable(node)?;
    }
    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin"]);
    match accel {
        HwAccel::Vaapi => {
            cmd.args(["-vaapi_device", node]);
        }
        HwAccel::Qsv => {
            let derive_from = format!("vaapi=va:{node}");
            cmd.args(["-init_hw_device", derive_from.as_str()])
                .args(["-init_hw_device", "qsv=hw@va", "-filter_hw_device", "hw"]);
        }
        _ => {}
    }
    cmd.args(["-f", "lavfi", "-i", TEST_SOURCE, "-frames:v", "3"]);
    if matches!(accel, HwAccel::Qsv | HwAccel::Vaapi) {
        cmd.args(["-vf", "format=nv12,hwupload"]);
    }
    cmd.args(["-c:v", encoder_of(accel)]);
    if matches!(accel, HwAccel::VideoToolbox | HwAccel::Nvenc) {
        cmd.args(["-b:v", "1000k"]);
    }
    cmd.args(["-f", "null", "-"]);
    crate::infra::ffmpeg_run::run_capturing(cmd, VALIDATE_TIMEOUT)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOFTWARE_ONLY: &[u8] = b"V..... libx264 libx264 H.264\nV..... libx265 libx265\n";

    #[test]
    fn a_build_with_no_hardware_encoder_names_the_build_as_the_reason() {
        // The static ffmpeg the NAS package used to ship: x264 and nothing else.
        assert!(candidates(SOFTWARE_ONLY).is_empty());
    }

    #[test]
    fn only_encoders_the_build_actually_lists_are_tried() {
        let vaapi_only = b"V..... libx264 libx264\nV..... h264_vaapi VAAPI H.264\n".as_slice();

        assert_eq!(candidates(vaapi_only), vec![HwAccel::Vaapi]);
    }

    #[test]
    fn qsv_is_tried_before_vaapi_on_a_build_that_has_both() {
        let both = b"V..... h264_vaapi VAAPI\nV..... h264_qsv QSV\nV..... h264_nvenc NVENC\n";

        assert_eq!(
            candidates(both.as_slice()),
            vec![HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc]
        );
    }

    #[test]
    fn a_render_node_that_is_not_there_says_so_rather_than_failing_silently() {
        let why = openable("/dev/dri/renderD-nope").unwrap_err();

        assert!(why.contains("does not exist"), "{why}");
    }

    #[test]
    fn every_pipeline_names_the_encoder_it_is_probed_by() {
        for accel in [
            HwAccel::VideoToolbox,
            HwAccel::Qsv,
            HwAccel::Vaapi,
            HwAccel::Nvenc,
            HwAccel::Software,
        ] {
            assert!(encoder_of(accel).contains("264"), "{}", accel.label());
        }
    }
}
