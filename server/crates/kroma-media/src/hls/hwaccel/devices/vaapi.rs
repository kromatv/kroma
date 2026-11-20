use super::super::super::software::Effort;
use super::super::device::{Decode, Device, Scale};
use super::super::render_node;

pub struct Vaapi;

impl Device for Vaapi {
    fn label(&self) -> &'static str {
        "vaapi"
    }

    fn encoder(&self) -> &'static str {
        "h264_vaapi"
    }

    fn rate_control(&self, _effort: Effort) -> &'static [&'static str] {
        &["-qp", "23"]
    }

    fn decode(&self) -> Decode {
        Decode::Device(vec![
            "-hwaccel",
            "vaapi",
            "-hwaccel_device",
            render_node::path(),
            "-hwaccel_output_format",
            "vaapi",
        ])
    }

    fn scale(&self) -> Scale {
        Scale::Device {
            filter: "scale_vaapi",
            format: "nv12",
        }
    }

    fn reachable(&self) -> Result<(), String> {
        render_node::openable()
    }

    fn probe_input_args(&self) -> Vec<String> {
        vec!["-vaapi_device".to_owned(), render_node::path().to_owned()]
    }

    fn probe_output_args(&self) -> &'static [&'static str] {
        &["-vf", "format=nv12,hwupload"]
    }
}
