use super::super::super::software::Effort;
use super::super::device::{Decode, Device, Scale};
use super::super::render_node;

pub struct Qsv;

impl Device for Qsv {
    fn label(&self) -> &'static str {
        "qsv"
    }

    fn encoder(&self) -> &'static str {
        "h264_qsv"
    }

    fn rate_control(&self, _effort: Effort) -> &'static [&'static str] {
        &["-global_quality", "23", "-look_ahead", "0"]
    }

    fn decode(&self) -> Decode {
        Decode::Device(vec!["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"])
    }

    fn scale(&self) -> Scale {
        Scale::Device {
            filter: "scale_qsv",
            format: "nv12",
        }
    }

    fn reachable(&self) -> Result<(), String> {
        render_node::openable()
    }

    fn probe_input_args(&self) -> Vec<String> {
        vec![
            "-init_hw_device".to_owned(),
            format!("vaapi=va:{}", render_node::path()),
            "-init_hw_device".to_owned(),
            "qsv=hw@va".to_owned(),
            "-filter_hw_device".to_owned(),
            "hw".to_owned(),
        ]
    }

    fn probe_output_args(&self) -> &'static [&'static str] {
        &["-vf", "format=nv12,hwupload"]
    }
}
