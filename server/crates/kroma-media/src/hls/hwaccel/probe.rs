//! Which device this host actually has, and why it does not have the others.
//!
//! Listing an encoder proves nothing: `h264_vaapi` appears in every build
//! configured with VAAPI whether or not the box has a driver, a render node, or
//! permission to open one. A device that is present, listed and unusable is
//! indistinguishable from no device at all unless something says so out loud, so
//! every candidate is made to encode three frames before it is believed, and the
//! sentence explaining the outcome is kept for the log and the admin.

use std::sync::{OnceLock, PoisonError, RwLock};
use std::time::Duration;

use crate::input;

use super::super::ffmpeg::ffmpeg_output;
use super::super::naming::contains;
use super::devices::{BY_TRUST, SOFTWARE};
use super::HwAccel;

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

// What the host can do, probed once per process because it cannot change while
// it runs. Which of it is used can: that is the operator's choice.
struct Survey {
    usable: Vec<HwAccel>,
    automatic: Detection,
}

static SURVEY: OnceLock<Survey> = OnceLock::new();
static CHOSEN: RwLock<Option<HwAccel>> = RwLock::new(None);

/// The pipeline re-encodes run on. `KROMA_HWACCEL=<label>` decides first, then
/// the encoder an operator chose with [`choose`], then the best one that passed
/// its test encode.
pub fn detect() -> HwAccel {
    detected().accel
}

/// [`detect`] with the sentence that explains it.
pub fn detected() -> Detection {
    if let Some(accel) = env_pin() {
        return Detection {
            accel,
            reason: format!("pinned by KROMA_HWACCEL={}", accel.label()),
        };
    }
    let chosen = *CHOSEN.read().unwrap_or_else(PoisonError::into_inner);
    decide(SURVEY.get_or_init(survey), chosen)
}

/// Sets the encoder an operator chose, by its label. Any other word, such as
/// `Auto`, hands the choice back to the probe.
pub fn choose(label: &str) {
    *CHOSEN.write().unwrap_or_else(PoisonError::into_inner) = pinned(label);
}

/// The labels of the hardware encoders that passed their test encode, best
/// first. Empty until the probe has run: this never starts it.
pub fn usable_labels() -> Vec<&'static str> {
    SURVEY
        .get()
        .map(|survey| survey.usable.iter().map(|accel| accel.label()).collect())
        .unwrap_or_default()
}

/// Whether `KROMA_HWACCEL` decides, which leaves an operator's choice unused.
pub fn pinned_by_env() -> bool {
    env_pin().is_some()
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

fn env_pin() -> Option<HwAccel> {
    std::env::var("KROMA_HWACCEL")
        .ok()
        .as_deref()
        .and_then(pinned)
}

fn decide(survey: &Survey, chosen: Option<HwAccel>) -> Detection {
    match chosen {
        None => survey.automatic.clone(),
        Some(accel) if accel == SOFTWARE || survey.usable.contains(&accel) => Detection {
            accel,
            reason: format!("{} is chosen in the settings", accel.label()),
        },
        Some(accel) => Detection {
            accel: survey.automatic.accel,
            reason: format!(
                "{} is chosen in the settings and is not usable here; {}",
                accel.label(),
                survey.automatic.reason
            ),
        },
    }
}

fn survey() -> Survey {
    let encoders = ffmpeg_output(&["-hide_banner", "-encoders"]);
    let listed = candidates(&encoders);
    if listed.is_empty() {
        return Survey {
            usable: Vec::new(),
            automatic: Detection {
                accel: SOFTWARE,
                reason: format!(
                    "this ffmpeg build lists no hardware H.264 encoder ({})",
                    known_encoders()
                ),
            },
        };
    }
    let mut passed = Vec::new();
    let mut refused = Vec::new();
    for accel in listed {
        match usable(accel) {
            Ok(()) => passed.push(accel),
            Err(why) => refused.push(format!("{}: {why}", accel.label())),
        }
    }
    Survey {
        automatic: automatic(&passed, &refused),
        usable: passed,
    }
}

fn automatic(usable: &[HwAccel], refused: &[String]) -> Detection {
    match usable.first() {
        Some(&accel) => Detection {
            accel,
            reason: format!("{} encoded a test frame", accel.device().encoder()),
        },
        None => Detection {
            accel: SOFTWARE,
            reason: format!(
                "every listed device refused a test encode ({})",
                refused.join("; ")
            ),
        },
    }
}

fn pinned(label: &str) -> Option<HwAccel> {
    if label == "none" {
        return Some(SOFTWARE);
    }
    BY_TRUST
        .into_iter()
        .chain([SOFTWARE])
        .find(|accel| accel.label() == label)
}

fn known_encoders() -> String {
    let names: Vec<&str> = BY_TRUST.iter().map(|a| a.device().encoder()).collect();
    names.join(", ")
}

fn candidates(encoders: &[u8]) -> Vec<HwAccel> {
    BY_TRUST
        .into_iter()
        .filter(|accel| {
            let device = accel.device();
            device.runs_here() && contains(encoders, device.encoder().as_bytes())
        })
        .collect()
}

fn usable(accel: HwAccel) -> Result<(), String> {
    accel.device().reachable()?;
    crate::ffmpeg_run::run_capturing(test_encode(accel), VALIDATE_TIMEOUT)
}

fn test_encode(accel: HwAccel) -> std::process::Command {
    let device = accel.device();
    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin"])
        .args(device.probe_input_args())
        .args(input::generated(TEST_SOURCE))
        .args(["-frames:v", "3", "-c:v", device.encoder()])
        .args(device.probe_output_args())
        .args(["-f", "null", "-"]);
    cmd
}

#[cfg(test)]
mod tests {
    use super::super::devices::{NVENC, QSV, V4L2M2M, VAAPI};
    use super::*;

    const SOFTWARE_ONLY: &[u8] = b"V..... libx264 libx264 H.264\nV..... libx265 libx265\n";

    #[test]
    fn a_build_with_no_hardware_encoder_names_the_build_as_the_reason() {
        assert!(candidates(SOFTWARE_ONLY).is_empty());
    }

    #[test]
    fn only_encoders_the_build_actually_lists_are_tried() {
        let vaapi_only = b"V..... libx264 libx264\nV..... h264_vaapi VAAPI H.264\n".as_slice();

        assert_eq!(candidates(vaapi_only), vec![VAAPI]);
    }

    #[test]
    fn qsv_is_tried_before_vaapi_on_a_build_that_has_both() {
        let both = b"V..... h264_vaapi VAAPI\nV..... h264_qsv QSV\nV..... h264_nvenc NVENC\n";

        assert_eq!(candidates(both.as_slice()), vec![QSV, VAAPI, NVENC]);
    }

    #[test]
    fn the_v4l2_encoder_is_tried_on_a_build_that_lists_it() {
        let arm = b"V..... libx264 libx264\nV..... h264_v4l2m2m V4L2 mem2mem H.264\n".as_slice();

        assert_eq!(candidates(arm), vec![V4L2M2M]);
    }

    #[test]
    fn every_device_can_be_pinned_by_the_label_it_is_logged_under() {
        for accel in BY_TRUST.into_iter().chain([SOFTWARE]) {
            assert_eq!(pinned(accel.label()), Some(accel));
        }
    }

    #[test]
    fn none_pins_the_software_path_and_an_unknown_label_pins_nothing() {
        assert_eq!(pinned("none"), Some(SOFTWARE));
        assert_eq!(pinned("quantum"), None);
    }

    fn host_with(usable: &[HwAccel]) -> Survey {
        Survey {
            usable: usable.to_vec(),
            automatic: automatic(usable, &["nvenc: no card".to_owned()]),
        }
    }

    #[test]
    fn the_first_encoder_that_passed_its_test_is_the_automatic_one() {
        let chosen = decide(&host_with(&[QSV, VAAPI]), None);

        assert_eq!(chosen.accel, QSV);
        assert_eq!(chosen.reason, "h264_qsv encoded a test frame");
    }

    #[test]
    fn a_host_where_every_encoder_failed_says_why_it_is_on_the_cpu() {
        let chosen = decide(&host_with(&[]), None);

        assert_eq!(chosen.accel, SOFTWARE);
        assert!(chosen.reason.contains("nvenc: no card"), "{}", chosen.reason);
    }

    #[test]
    fn an_operator_takes_a_usable_encoder_over_the_automatic_one() {
        let chosen = decide(&host_with(&[QSV, VAAPI]), Some(VAAPI));

        assert_eq!(chosen.accel, VAAPI);
        assert_eq!(chosen.reason, "vaapi is chosen in the settings");
    }

    #[test]
    fn an_operator_can_always_choose_the_software_path() {
        let chosen = decide(&host_with(&[QSV]), Some(SOFTWARE));

        assert_eq!(chosen.accel, SOFTWARE);
    }

    #[test]
    fn a_chosen_encoder_this_host_cannot_use_falls_back_and_says_so() {
        let chosen = decide(&host_with(&[QSV]), Some(V4L2M2M));

        assert_eq!(chosen.accel, QSV);
        assert!(
            chosen.reason.starts_with("v4l2m2m is chosen in the settings and is not usable"),
            "{}",
            chosen.reason
        );
    }

    #[test]
    fn the_test_encode_asks_the_device_for_three_frames_and_keeps_nothing() {
        let cmd = test_encode(V4L2M2M);
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let line = args.join(" ");

        assert_eq!(cmd.get_program(), "ffmpeg");
        assert!(line.contains(TEST_SOURCE), "{line}");
        assert!(
            line.ends_with("-frames:v 3 -c:v h264_v4l2m2m -b:v 1000k -f null -"),
            "{line}"
        );
    }

    #[test]
    fn an_encoder_that_is_out_of_reach_is_refused_before_ffmpeg_is_asked() {
        if let Err(why) = V4L2M2M.device().reachable() {
            assert_eq!(usable(V4L2M2M), Err(why));
        }
    }

    #[test]
    fn an_operators_choice_is_kept_by_label_and_any_other_word_gives_it_back() {
        choose("software");
        let kept = *CHOSEN.read().unwrap();
        choose("Auto");
        let given_back = *CHOSEN.read().unwrap();

        assert_eq!(kept, Some(SOFTWARE));
        assert_eq!(given_back, None);
    }

    #[test]
    fn a_build_with_no_device_is_told_every_encoder_that_was_looked_for() {
        let names = known_encoders();

        for accel in BY_TRUST {
            assert!(names.contains(accel.device().encoder()), "{names}");
        }
    }
}
