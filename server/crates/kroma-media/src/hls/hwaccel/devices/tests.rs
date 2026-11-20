use super::super::render_node;
use super::*;

#[test]
fn only_the_apple_encoder_is_tied_to_an_operating_system() {
    assert_eq!(
        VIDEOTOOLBOX.device().runs_here(),
        cfg!(target_os = "macos")
    );
    for accel in [QSV, VAAPI, NVENC, V4L2M2M, SOFTWARE] {
        assert!(accel.device().runs_here(), "{accel:?}");
    }
}

#[test]
fn an_encoder_with_nothing_to_open_is_always_reachable() {
    for accel in [VIDEOTOOLBOX, NVENC, SOFTWARE] {
        assert_eq!(accel.device().reachable(), Ok(()), "{accel:?}");
    }
}

#[test]
fn an_intel_encoder_that_is_out_of_reach_names_the_render_node() {
    for accel in [QSV, VAAPI] {
        if let Err(why) = accel.device().reachable() {
            assert!(why.contains(render_node::path()), "{accel:?}: {why}");
        }
    }
}

#[test]
fn a_v4l2_encoder_that_is_out_of_reach_names_the_video_device() {
    if let Err(why) = V4L2M2M.device().reachable() {
        assert!(why.contains("video device"), "{why}");
    }
}

#[test]
fn the_intel_test_encodes_open_the_render_node_and_upload_to_it() {
    let node = render_node::path().to_owned();

    assert_eq!(VAAPI.device().probe_input_args(), ["-vaapi_device", node.as_str()]);
    assert!(QSV
        .device()
        .probe_input_args()
        .contains(&format!("vaapi=va:{node}")));
    for accel in [QSV, VAAPI] {
        assert_eq!(
            accel.device().probe_output_args(),
            ["-vf", "format=nv12,hwupload"],
            "{accel:?}"
        );
    }
}

#[test]
fn an_encoder_with_no_constant_quality_mode_is_tested_at_a_bitrate() {
    for accel in [VIDEOTOOLBOX, NVENC, V4L2M2M] {
        assert!(accel.device().probe_input_args().is_empty(), "{accel:?}");
        assert_eq!(
            accel.device().probe_output_args(),
            ["-b:v", "1000k"],
            "{accel:?}"
        );
    }
}

#[test]
fn the_software_path_needs_nothing_from_the_host() {
    let software = SOFTWARE.device();

    assert!(software.probe_input_args().is_empty());
    assert!(software.probe_output_args().is_empty());
    assert_eq!(software.ceiling(), None);
}
