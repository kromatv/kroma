use super::super::super::software::Effort;
use super::super::device::Device;
use super::super::video_node;

pub struct V4l2m2m;

impl Device for V4l2m2m {
    fn label(&self) -> &'static str {
        "v4l2m2m"
    }

    fn encoder(&self) -> &'static str {
        "h264_v4l2m2m"
    }

    fn rate_control(&self, _effort: Effort) -> &'static [&'static str] {
        &["-b:v", "8000k"]
    }

    // The Raspberry Pi 4's encoder stops at 1080p, and it is the V4L2 encoder
    // this build is made for.
    fn ceiling(&self) -> Option<(u32, u32)> {
        Some((1920, 1080))
    }

    fn reachable(&self) -> Result<(), String> {
        video_node::openable()
    }

    fn probe_output_args(&self) -> &'static [&'static str] {
        &["-b:v", "1000k"]
    }
}
