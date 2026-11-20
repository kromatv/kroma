use super::super::super::software::Effort;
use super::super::device::{Decode, Device, Scale};

pub struct Nvenc;

impl Device for Nvenc {
    fn label(&self) -> &'static str {
        "nvenc"
    }

    fn encoder(&self) -> &'static str {
        "h264_nvenc"
    }

    fn rate_control(&self, _effort: Effort) -> &'static [&'static str] {
        &["-preset", "p4", "-rc", "vbr", "-cq", "23"]
    }

    fn decode(&self) -> Decode {
        Decode::Device(vec!["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"])
    }

    fn scale(&self) -> Scale {
        Scale::Device {
            filter: "scale_cuda",
            format: "yuv420p",
        }
    }

    fn probe_output_args(&self) -> &'static [&'static str] {
        &["-b:v", "1000k"]
    }
}
