//! What this host can hand a picture to.
//!
//! A re-encode is the one thing in the delivery path that costs real CPU, so it
//! is the one thing worth putting on fixed-function silicon: an Intel iGPU, an
//! Apple VideoToolbox block, an NVIDIA encoder or a Raspberry Pi's turns a
//! re-encode from "one stream saturates the box" into a fraction of it. Probed
//! once per process, because the answer cannot change while it runs.
//!
//! [`device`] is the questions every encoder answers, `devices/` holds one
//! file per encoder, and this file turns the answers into ffmpeg arguments
//! without naming any of them. [`probe`] is where the choice comes from, and why
//! it is worth reporting: a device that is present, listed and unusable looks
//! exactly like no device at all from the outside, and the operator is the only
//! one who can fix it.

mod device;
pub(super) mod devices;
mod probe;
mod render_node;
mod video_node;

use std::fmt;

use super::software::Effort;
use device::{Decode, Device, Scale};

pub use probe::{detect, detected, prime, Detection};

/// What one re-encode runs on: the device that encodes the picture and how hard
/// the CPU is allowed to work per frame on whatever part of the job it keeps.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Pipeline {
    pub accel: HwAccel,
    pub effort: Effort,
}

impl Pipeline {
    /// The device this host has, where it takes this picture, and the tier this
    /// job can afford, from the picture going in and the box it is fitted into.
    pub fn choose(source: Option<(u32, u32)>, target: Option<(u32, u32)>) -> Self {
        Self {
            accel: detect().for_picture(target.or(source)),
            effort: Effort::choose(source, target),
        }
    }

    /// Whether the frames are rebuilt by the CPU, which is the only case where
    /// the box has to be taken away from background work.
    pub fn on_the_cpu(self) -> bool {
        !self.accel.decodes_on_the_device()
    }
}

/// The encoder the picture takes when it has to be re-encoded.
/// `devices::SOFTWARE` is the floor, not a failure: it is what a host with no
/// usable device gets.
#[derive(Clone, Copy)]
pub struct HwAccel(&'static dyn Device);

impl PartialEq for HwAccel {
    fn eq(&self, other: &Self) -> bool {
        self.label() == other.label()
    }
}

impl Eq for HwAccel {}

impl fmt::Debug for HwAccel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.label())
    }
}

impl HwAccel {
    pub(super) const fn of(device: &'static dyn Device) -> Self {
        Self(device)
    }

    pub(super) fn device(self) -> &'static dyn Device {
        self.0
    }

    /// How it reads in a log line or an admin field.
    pub fn label(self) -> &'static str {
        self.0.label()
    }

    /// Whether the picture is encoded by fixed-function silicon rather than by
    /// the CPU.
    pub fn is_device(self) -> bool {
        self != devices::SOFTWARE
    }

    /// Whether the device decodes the source too. Where it only encodes, the
    /// decode and the downscale stay on the CPU and the effort tier applies.
    pub fn decodes_on_the_device(self) -> bool {
        matches!(self.0.decode(), Decode::Device(_))
    }

    /// This device for a picture it can encode, and the software path for a
    /// larger one or for one nobody measured.
    pub fn for_picture(self, picture: Option<(u32, u32)>) -> Self {
        match (self.0.ceiling(), picture) {
            (None, _) => self,
            (Some((max_w, max_h)), Some((w, h))) if w <= max_w && h <= max_h => self,
            _ => devices::SOFTWARE,
        }
    }

    /// Args that must precede `-i`: they choose the decoder and say which memory
    /// the decoded frames land in.
    pub fn input_args(self, effort: Effort) -> Vec<&'static str> {
        match self.0.decode() {
            Decode::Cpu => effort.decoder_args().to_vec(),
            Decode::Device(args) => args,
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
    /// With or without one, a device that scales in its own memory must still be
    /// told the format to hand over: the decoder keeps a 10-bit source in 10-bit
    /// surfaces and none of these encoders takes 10-bit H.264, so the filter is
    /// where the depth is dropped.
    pub fn video_filter(self, size: Option<(u32, u32)>, effort: Effort) -> Option<String> {
        let fit = size.map(|(w, h)| {
            format!("w={w}:h={h}:force_original_aspect_ratio=decrease:force_divisible_by=2")
        });
        match self.0.scale() {
            Scale::Cpu => fit.map(|fit| match effort.sws_flags() {
                Some(flags) => format!("scale={fit}:flags={flags}"),
                None => format!("scale={fit}"),
            }),
            Scale::Device { filter, format } => Some(match fit {
                Some(fit) => format!("{filter}={fit}:format={format}"),
                None => format!("{filter}=format={format}"),
            }),
        }
    }

    /// The encoder and its rate control. 8-bit H.264 whatever the device: the
    /// re-encode exists for players the source defeats, so it must land on the
    /// one profile every target reads.
    pub fn encoder_args(self, effort: Effort) -> Vec<&'static str> {
        let mut args = vec!["-c:v", self.0.encoder()];
        args.extend_from_slice(self.0.rate_control(effort));
        if matches!(self.0.scale(), Scale::Cpu) {
            args.extend_from_slice(&["-pix_fmt", "yuv420p"]);
        }
        args
    }
}

#[cfg(test)]
mod tests;
