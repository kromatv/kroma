use super::super::super::software::Effort;
use super::super::device::Device;

pub struct Software;

impl Device for Software {
    fn label(&self) -> &'static str {
        "software"
    }

    fn encoder(&self) -> &'static str {
        "libx264"
    }

    fn rate_control(&self, effort: Effort) -> &'static [&'static str] {
        effort.x264_args()
    }
}
