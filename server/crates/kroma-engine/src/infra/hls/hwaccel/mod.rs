//! What this host can hand a picture to.
//!
//! A re-encode is the one thing in the delivery path that costs real CPU, so it
//! is the one thing worth putting on fixed-function silicon: an Intel iGPU, an
//! Apple VideoToolbox block or an NVIDIA encoder turns a 4K→1080p downscale from
//! "one stream saturates the box" into single-digit percent. Probed once per
//! process, because the answer cannot change while it runs.
//!
//! [`probe`] is where the answer comes from, and why it is worth reporting: a
//! device that is present, listed and unusable looks exactly like no device at
//! all from the outside, and the operator is the only one who can fix it.

mod probe;

use std::sync::OnceLock;

use super::software::Effort;

pub use probe::{detect, detected, prime, Detection};

/// What one re-encode runs on: the device that shrinks the picture and, where
/// that device is the CPU, how hard it is allowed to work per frame. The two are
/// one decision - the tier only means anything on the software path - so they
/// are chosen and carried together.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Pipeline {
    pub accel: HwAccel,
    pub effort: Effort,
}

impl Pipeline {
    /// The device this host has, and the tier this job can afford on it, from the
    /// picture going in and the box it is fitted into.
    pub fn choose(source: Option<(u32, u32)>, target: Option<(u32, u32)>) -> Self {
        Self {
            accel: detect(),
            effort: Effort::choose(source, target),
        }
    }

    /// Whether the frames are rebuilt by the CPU, which is the only case where
    /// the box has to be taken away from background work.
    pub const fn on_the_cpu(self) -> bool {
        !self.accel.is_device()
    }
}

/// The pipeline the picture takes when it has to be re-encoded. `Software` is
/// the floor, not a failure: it is what a host with no usable device gets.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HwAccel {
    VideoToolbox,
    Qsv,
    Vaapi,
    Nvenc,
    Software,
}

/// The Linux render node VAAPI and QSV open when nothing says otherwise. A host
/// with several (an iGPU beside a card) names the one it means with
/// `KROMA_RENDER_NODE`, because that choice belongs to an operator, not a probe.
const DEFAULT_RENDER_NODE: &str = "/dev/dri/renderD128";

pub(super) fn render_node() -> &'static str {
    static NODE: OnceLock<&'static str> = OnceLock::new();
    NODE.get_or_init(|| match std::env::var("KROMA_RENDER_NODE") {
        Ok(v) if !v.trim().is_empty() => Box::leak(v.trim().to_owned().into_boxed_str()),
        _ => DEFAULT_RENDER_NODE,
    })
}

impl HwAccel {
    /// How it reads in a log line or an admin field.
    pub const fn label(self) -> &'static str {
        match self {
            Self::VideoToolbox => "videotoolbox",
            Self::Qsv => "qsv",
            Self::Vaapi => "vaapi",
            Self::Nvenc => "nvenc",
            Self::Software => "software",
        }
    }

    /// Whether the picture is shrunk by fixed-function silicon rather than by
    /// the CPU, which is what decides whether the effort tier matters at all.
    pub const fn is_device(self) -> bool {
        !matches!(self, Self::Software)
    }

    /// Args that must precede `-i`: they choose the decoder and say which memory
    /// the decoded frames land in. `effort` only reaches the software path, whose
    /// decoder is the CPU.
    pub fn input_args(self, effort: Effort) -> Vec<&'static str> {
        match self {
            Self::VideoToolbox => vec!["-hwaccel", "videotoolbox"],
            Self::Qsv => vec!["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
            Self::Vaapi => vec![
                "-hwaccel",
                "vaapi",
                "-hwaccel_device",
                render_node(),
                "-hwaccel_output_format",
                "vaapi",
            ],
            Self::Nvenc => vec!["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
            Self::Software => effort.decoder_args().to_vec(),
        }
    }

    /// The `-vf` this device needs to reach the encoder, or None where the
    /// picture already arrives in a shape it takes.
    ///
    /// Given a box, the picture is fitted inside it without changing shape:
    /// `decrease` is what makes it a box rather than a size, so a scope frame
    /// comes out width-limited and short and a 16:9 one height-limited, and
    /// `force_divisible_by=2` because H.264 has no odd dimensions.
    ///
    /// With or without one, a device pipeline must still be told the format to
    /// hand over: the decoder keeps a 10-bit source in 10-bit surfaces and none
    /// of these encoders takes 10-bit H.264, so the filter is where the depth is
    /// dropped. The software and VideoToolbox paths carry frames in system
    /// memory, where the encoder's own `-pix_fmt` does it instead.
    ///
    /// Each device scales in the memory it decoded into, which is why this is
    /// five filters and not one with a flag.
    pub fn video_filter(self, size: Option<(u32, u32)>, effort: Effort) -> Option<String> {
        let fit = size.map(|(w, h)| {
            format!("w={w}:h={h}:force_original_aspect_ratio=decrease:force_divisible_by=2")
        });
        let device = |name: &str, format: &str| {
            Some(match &fit {
                Some(fit) => format!("{name}={fit}:format={format}"),
                None => format!("{name}=format={format}"),
            })
        };
        match self {
            // Frames leave VideoToolbox for the scaler, so this one runs on the
            // CPU: it is the only part of the pipeline that does.
            Self::VideoToolbox | Self::Software => fit.as_ref().map(|fit| match effort.sws_flags() {
                Some(flags) => format!("scale={fit}:flags={flags}"),
                None => format!("scale={fit}"),
            }),
            Self::Qsv => device("scale_qsv", "nv12"),
            Self::Vaapi => device("scale_vaapi", "nv12"),
            Self::Nvenc => device("scale_cuda", "yuv420p"),
        }
    }

    /// The encoder and its rate control. 8-bit H.264 whatever the device: the
    /// re-encode exists for players the source defeats, so it must land on the
    /// one profile every target reads.
    pub fn encoder_args(self, effort: Effort) -> Vec<&'static str> {
        match self {
            // VideoToolbox has no CRF: quality is a bitrate, and `-realtime`
            // keeps the encoder from buffering a whole GOP ahead of the player.
            Self::VideoToolbox => vec![
                "-c:v",
                "h264_videotoolbox",
                "-realtime",
                "1",
                "-b:v",
                "8000k",
                "-pix_fmt",
                "yuv420p",
            ],
            Self::Qsv => vec!["-c:v", "h264_qsv", "-global_quality", "23", "-look_ahead", "0"],
            Self::Vaapi => vec!["-c:v", "h264_vaapi", "-qp", "23"],
            Self::Nvenc => vec!["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23"],
            Self::Software => {
                let mut args = vec!["-c:v", "libx264"];
                args.extend_from_slice(effort.x264_args());
                args.extend_from_slice(&["-pix_fmt", "yuv420p"]);
                args
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVERY: [HwAccel; 5] = [
        HwAccel::VideoToolbox,
        HwAccel::Qsv,
        HwAccel::Vaapi,
        HwAccel::Nvenc,
        HwAccel::Software,
    ];

    #[test]
    fn scales_in_the_memory_each_device_decodes_into() {
        assert_eq!(
            HwAccel::Vaapi.video_filter(Some((1920, 1080)), Effort::Quality).unwrap(),
            "scale_vaapi=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
        );
        assert_eq!(
            HwAccel::Qsv.video_filter(Some((1280, 720)), Effort::Quality).unwrap(),
            "scale_qsv=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
        );
        assert!(HwAccel::Nvenc
            .video_filter(Some((1920, 1080)), Effort::Quality)
            .unwrap()
            .starts_with("scale_cuda="));
        assert!(HwAccel::Software
            .video_filter(Some((1920, 1080)), Effort::Quality)
            .unwrap()
            .starts_with("scale=w=1920"));
    }

    #[test]
    fn fits_inside_the_box_rather_than_stretching_to_it() {
        // Every scaler must keep the shape: a scope frame ends width-limited.
        for accel in EVERY {
            let filter = accel.video_filter(Some((1920, 1080)), Effort::Quality).unwrap();

            assert!(
                filter.contains("force_original_aspect_ratio=decrease"),
                "{}: {filter}",
                accel.label()
            );
        }
    }

    #[test]
    fn only_the_scalers_that_run_on_the_cpu_take_the_cheaper_kernel() {
        for accel in [HwAccel::Software, HwAccel::VideoToolbox] {
            let filter = accel.video_filter(Some((1920, 1080)), Effort::Realtime).unwrap();

            assert!(filter.ends_with(":flags=fast_bilinear"), "{}: {filter}", accel.label());
        }
        for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
            let filter = accel.video_filter(Some((1920, 1080)), Effort::Realtime).unwrap();

            assert!(!filter.contains("fast_bilinear"), "{}: {filter}", accel.label());
        }
    }

    #[test]
    fn drops_the_depth_on_a_device_even_where_nothing_is_resized() {
        // A 10-bit source decodes into 10-bit surfaces and no encoder here takes
        // them, so a full-size re-encode still needs the format handed over.
        for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
            let filter = accel.video_filter(None, Effort::Quality).unwrap();

            assert!(filter.contains("format="), "{}: {filter}", accel.label());
        }
    }

    #[test]
    fn leaves_the_depth_to_the_encoder_where_the_frames_are_in_system_memory() {
        assert_eq!(HwAccel::Software.video_filter(None, Effort::Quality), None);
        assert_eq!(HwAccel::VideoToolbox.video_filter(None, Effort::Quality), None);
        for accel in [HwAccel::Software, HwAccel::VideoToolbox] {
            assert!(
                accel.encoder_args(Effort::Quality).contains(&"yuv420p"),
                "{}",
                accel.label()
            );
        }
    }

    #[test]
    fn every_device_encodes_to_the_h264_every_target_reads() {
        for accel in EVERY {
            let args = accel.encoder_args(Effort::Quality).join(" ");

            assert!(args.contains("264"), "{}: {args}", accel.label());
        }
    }

    #[test]
    fn the_effort_tier_only_reaches_the_encoder_the_cpu_runs() {
        for accel in [HwAccel::VideoToolbox, HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
            assert_eq!(
                accel.encoder_args(Effort::Quality),
                accel.encoder_args(Effort::Realtime),
                "{}",
                accel.label()
            );
            assert!(accel.is_device(), "{}", accel.label());
        }
        assert_ne!(
            HwAccel::Software.encoder_args(Effort::Quality),
            HwAccel::Software.encoder_args(Effort::Realtime)
        );
        assert!(!HwAccel::Software.is_device());
    }

    #[test]
    fn a_device_decodes_on_the_device_and_the_cpu_path_takes_the_tiers_flags() {
        assert!(HwAccel::Vaapi.input_args(Effort::Quality).contains(&"vaapi"));
        assert!(HwAccel::Software.input_args(Effort::Quality).is_empty());
        assert!(HwAccel::Software
            .input_args(Effort::Realtime)
            .contains(&"-skip_loop_filter"));
    }
}
