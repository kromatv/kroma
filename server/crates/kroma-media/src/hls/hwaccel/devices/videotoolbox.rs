use super::super::super::software::Effort;
use super::super::device::{Decode, Device};

pub struct VideoToolbox;

impl Device for VideoToolbox {
    fn label(&self) -> &'static str {
        "videotoolbox"
    }

    fn encoder(&self) -> &'static str {
        "h264_videotoolbox"
    }

    // VideoToolbox has no CRF: quality is a bitrate, and `-realtime` keeps the
    // encoder from buffering a whole GOP ahead of the player.
    fn rate_control(&self, _effort: Effort) -> &'static [&'static str] {
        &["-realtime", "1", "-b:v", "8000k"]
    }

    fn decode(&self) -> Decode {
        Decode::Device(vec!["-hwaccel", "videotoolbox"])
    }

    fn runs_here(&self) -> bool {
        cfg!(target_os = "macos")
    }

    fn probe_output_args(&self) -> &'static [&'static str] {
        &["-b:v", "1000k"]
    }
}
