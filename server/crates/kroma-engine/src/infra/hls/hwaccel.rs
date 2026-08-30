//! What this host can hand a picture to.
//!
//! A re-encode is the one thing in the delivery path that costs real CPU, so it
//! is the one thing worth putting on fixed-function silicon: an Intel iGPU, an
//! Apple VideoToolbox block or an NVIDIA encoder turns a 4K→1080p downscale from
//! "one stream saturates the box" into single-digit percent. Probed once per
//! process, because the answer cannot change while it runs.

use std::path::Path;
use std::sync::OnceLock;

use super::ffmpeg::ffmpeg_output;
use super::naming::contains;

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

/// The Linux render node VAAPI and QSV open. Fixed rather than scanned: a host
/// with several is a host where the choice belongs to an operator, not to a probe.
const RENDER_NODE: &str = "/dev/dri/renderD128";

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

    /// Args that must precede `-i`: they choose the decoder and say which memory
    /// the decoded frames land in.
    pub const fn input_args(self) -> &'static [&'static str] {
        match self {
            Self::VideoToolbox => &["-hwaccel", "videotoolbox"],
            Self::Qsv => &["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
            Self::Vaapi => &[
                "-hwaccel",
                "vaapi",
                "-hwaccel_device",
                RENDER_NODE,
                "-hwaccel_output_format",
                "vaapi",
            ],
            Self::Nvenc => &["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
            Self::Software => &[],
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
    pub fn video_filter(self, size: Option<(u32, u32)>) -> Option<String> {
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
            Self::VideoToolbox | Self::Software => fit.as_ref().map(|fit| format!("scale={fit}")),
            Self::Qsv => device("scale_qsv", "nv12"),
            Self::Vaapi => device("scale_vaapi", "nv12"),
            Self::Nvenc => device("scale_cuda", "yuv420p"),
        }
    }

    /// The encoder and its rate control. 8-bit H.264 whatever the device: the
    /// re-encode exists for players the source defeats, so it must land on the
    /// one profile every target reads.
    pub const fn encoder_args(self) -> &'static [&'static str] {
        match self {
            // VideoToolbox has no CRF: quality is a bitrate, and `-realtime`
            // keeps the encoder from buffering a whole GOP ahead of the player.
            Self::VideoToolbox => &[
                "-c:v",
                "h264_videotoolbox",
                "-realtime",
                "1",
                "-b:v",
                "8000k",
                "-pix_fmt",
                "yuv420p",
            ],
            Self::Qsv => &["-c:v", "h264_qsv", "-global_quality", "23", "-look_ahead", "0"],
            Self::Vaapi => &["-c:v", "h264_vaapi", "-qp", "23"],
            Self::Nvenc => &["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23"],
            Self::Software => &[
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "21",
                "-pix_fmt",
                "yuv420p",
            ],
        }
    }
}

static DETECTED: OnceLock<HwAccel> = OnceLock::new();

/// The best pipeline this host offers, probed once. Override with
/// `KROMA_HWACCEL=<label>`, which is how an operator picks between two devices
/// or pins the software path to rule it out of a problem.
pub fn detect() -> HwAccel {
    *DETECTED.get_or_init(|| match std::env::var("KROMA_HWACCEL").ok().as_deref() {
        Some("videotoolbox") => HwAccel::VideoToolbox,
        Some("qsv") => HwAccel::Qsv,
        Some("vaapi") => HwAccel::Vaapi,
        Some("nvenc") => HwAccel::Nvenc,
        Some("software") | Some("none") => HwAccel::Software,
        _ => probe(&ffmpeg_output(&["-hide_banner", "-encoders"])),
    })
}

// Ordered by how little the host has to be trusted for it to work: an Apple
// block is always there and always right; QSV beats VAAPI on the Intel parts
// that have both; NVENC needs a card the encoder list alone does not prove.
fn probe(encoders: &[u8]) -> HwAccel {
    let has = |name: &str| contains(encoders, name.as_bytes());
    if cfg!(target_os = "macos") && has("h264_videotoolbox") {
        return HwAccel::VideoToolbox;
    }
    let render_node = Path::new(RENDER_NODE).exists();
    if render_node && has("h264_qsv") {
        return HwAccel::Qsv;
    }
    if render_node && has("h264_vaapi") {
        return HwAccel::Vaapi;
    }
    if has("h264_nvenc") && Path::new("/dev/nvidia0").exists() {
        return HwAccel::Nvenc;
    }
    HwAccel::Software
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_software_when_the_host_offers_no_device() {
        let encoders = b"V..... libx264 libx264 H.264\n".as_slice();

        assert_eq!(probe(encoders), HwAccel::Software);
    }

    #[test]
    fn scales_in_the_memory_each_device_decodes_into() {
        assert_eq!(
            HwAccel::Vaapi.video_filter(Some((1920, 1080))).unwrap(),
            "scale_vaapi=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
        );
        assert_eq!(
            HwAccel::Qsv.video_filter(Some((1280, 720))).unwrap(),
            "scale_qsv=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
        );
        assert!(HwAccel::Nvenc
            .video_filter(Some((1920, 1080)))
            .unwrap()
            .starts_with("scale_cuda="));
        assert!(HwAccel::Software
            .video_filter(Some((1920, 1080)))
            .unwrap()
            .starts_with("scale=w=1920"));
    }

    #[test]
    fn fits_inside_the_box_rather_than_stretching_to_it() {
        // Every scaler must keep the shape: a scope frame ends width-limited.
        for accel in [
            HwAccel::VideoToolbox,
            HwAccel::Qsv,
            HwAccel::Vaapi,
            HwAccel::Nvenc,
            HwAccel::Software,
        ] {
            let filter = accel.video_filter(Some((1920, 1080))).unwrap();

            assert!(
                filter.contains("force_original_aspect_ratio=decrease"),
                "{}: {filter}",
                accel.label()
            );
        }
    }

    #[test]
    fn drops_the_depth_on_a_device_even_where_nothing_is_resized() {
        // A 10-bit source decodes into 10-bit surfaces and no encoder here takes
        // them, so a full-size re-encode still needs the format handed over.
        for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
            let filter = accel.video_filter(None).unwrap();

            assert!(filter.contains("format="), "{}: {filter}", accel.label());
        }
    }

    #[test]
    fn leaves_the_depth_to_the_encoder_where_the_frames_are_in_system_memory() {
        assert_eq!(HwAccel::Software.video_filter(None), None);
        assert_eq!(HwAccel::VideoToolbox.video_filter(None), None);
        for accel in [HwAccel::Software, HwAccel::VideoToolbox] {
            assert!(accel.encoder_args().contains(&"yuv420p"), "{}", accel.label());
        }
    }

    #[test]
    fn every_device_encodes_to_the_h264_every_target_reads() {
        for accel in [
            HwAccel::VideoToolbox,
            HwAccel::Qsv,
            HwAccel::Vaapi,
            HwAccel::Nvenc,
            HwAccel::Software,
        ] {
            let args = accel.encoder_args().join(" ");

            assert!(args.contains("264"), "{}: {args}", accel.label());
        }
    }
}
