use std::collections::HashSet;

use super::devices::{BY_TRUST, NVENC, QSV, SOFTWARE, V4L2M2M, VAAPI, VIDEOTOOLBOX};
use super::*;

const HD: Option<(u32, u32)> = Some((1920, 1080));

fn every() -> impl Iterator<Item = HwAccel> {
    BY_TRUST.into_iter().chain([SOFTWARE])
}

fn scales_on_the_cpu(accel: HwAccel) -> bool {
    matches!(accel.device().scale(), Scale::Cpu)
}

#[test]
fn scales_in_the_memory_each_device_decodes_into() {
    assert_eq!(
        VAAPI.video_filter(HD, Effort::Quality).unwrap(),
        "scale_vaapi=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
    );
    assert_eq!(
        QSV.video_filter(Some((1280, 720)), Effort::Quality).unwrap(),
        "scale_qsv=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
    );
    assert!(NVENC
        .video_filter(HD, Effort::Quality)
        .unwrap()
        .starts_with("scale_cuda="));
    assert!(SOFTWARE
        .video_filter(HD, Effort::Quality)
        .unwrap()
        .starts_with("scale=w=1920"));
}

#[test]
fn fits_inside_the_box_rather_than_stretching_to_it() {
    for accel in every() {
        let filter = accel.video_filter(HD, Effort::Quality).unwrap();

        assert!(
            filter.contains("force_original_aspect_ratio=decrease"),
            "{accel:?}: {filter}"
        );
    }
}

#[test]
fn only_the_scalers_that_run_on_the_cpu_take_the_cheaper_kernel() {
    for accel in every() {
        let filter = accel.video_filter(HD, Effort::Realtime).unwrap();

        assert_eq!(
            filter.ends_with(":flags=fast_bilinear"),
            scales_on_the_cpu(accel),
            "{accel:?}: {filter}"
        );
    }
}

#[test]
fn every_device_hands_the_encoder_eight_bits_whatever_the_source_and_the_box() {
    for accel in every() {
        for size in [None, HD] {
            let filter = accel.video_filter(size, Effort::Quality).unwrap_or_default();
            let encoder = accel.encoder_args(Effort::Quality);

            assert!(
                filter.contains("format=nv12")
                    || filter.contains("format=yuv420p")
                    || encoder.ends_with(&["-pix_fmt", "yuv420p"]),
                "{accel:?}: {filter}"
            );
        }
    }
}

#[test]
fn a_picture_scaled_on_the_cpu_needs_no_filter_when_nothing_is_resized() {
    for accel in [SOFTWARE, VIDEOTOOLBOX, V4L2M2M] {
        assert_eq!(accel.video_filter(None, Effort::Quality), None, "{accel:?}");
    }
}

#[test]
fn every_device_encodes_to_the_h264_every_target_reads() {
    for accel in every() {
        let args = accel.encoder_args(Effort::Quality);

        assert_eq!(args[0], "-c:v", "{accel:?}");
        assert!(args[1].contains("264"), "{accel:?}: {}", args[1]);
    }
}

#[test]
fn the_effort_tier_only_reaches_the_encoder_the_cpu_runs() {
    for accel in BY_TRUST {
        assert_eq!(
            accel.encoder_args(Effort::Quality),
            accel.encoder_args(Effort::Realtime),
            "{accel:?}"
        );
        assert!(accel.is_device(), "{accel:?}");
    }
    assert_ne!(
        SOFTWARE.encoder_args(Effort::Quality),
        SOFTWARE.encoder_args(Effort::Realtime)
    );
    assert!(!SOFTWARE.is_device());
}

#[test]
fn a_device_decodes_on_the_device_and_the_cpu_path_takes_the_tiers_flags() {
    assert!(VAAPI.input_args(Effort::Quality).contains(&"vaapi"));
    assert!(SOFTWARE.input_args(Effort::Quality).is_empty());
    assert!(SOFTWARE
        .input_args(Effort::Realtime)
        .contains(&"-skip_loop_filter"));
}

#[test]
fn a_device_that_only_encodes_leaves_the_decode_to_the_cpu_and_its_tier() {
    let pipeline = Pipeline {
        accel: V4L2M2M,
        effort: Effort::Realtime,
    };

    assert!(V4L2M2M.is_device());
    assert!(pipeline.on_the_cpu());
    assert_eq!(
        V4L2M2M.input_args(Effort::Realtime),
        SOFTWARE.input_args(Effort::Realtime)
    );
}

#[test]
fn a_device_that_decodes_too_keeps_the_job_off_the_cpu() {
    for accel in [VIDEOTOOLBOX, QSV, VAAPI, NVENC] {
        let pipeline = Pipeline {
            accel,
            effort: Effort::Quality,
        };

        assert!(!pipeline.on_the_cpu(), "{accel:?}");
    }
}

#[test]
fn a_picture_past_an_encoders_ceiling_goes_to_the_software_path() {
    assert_eq!(V4L2M2M.for_picture(HD), V4L2M2M);
    assert_eq!(V4L2M2M.for_picture(Some((1920, 800))), V4L2M2M);
    assert_eq!(V4L2M2M.for_picture(Some((3840, 2160))), SOFTWARE);
    assert_eq!(V4L2M2M.for_picture(Some((1080, 1920))), SOFTWARE);
}

#[test]
fn a_picture_nobody_measured_is_not_trusted_to_an_encoder_with_a_ceiling() {
    assert_eq!(V4L2M2M.for_picture(None), SOFTWARE);
}

#[test]
fn a_device_with_no_ceiling_takes_every_picture() {
    for accel in [VIDEOTOOLBOX, QSV, VAAPI, NVENC, SOFTWARE] {
        assert_eq!(accel.for_picture(Some((3840, 2160))), accel, "{accel:?}");
        assert_eq!(accel.for_picture(None), accel, "{accel:?}");
    }
}

#[test]
fn no_two_devices_share_a_label_or_an_encoder() {
    let labels: HashSet<&str> = every().map(HwAccel::label).collect();
    let encoders: HashSet<&str> = every().map(|a| a.device().encoder()).collect();

    assert_eq!(labels.len(), BY_TRUST.len() + 1);
    assert_eq!(encoders.len(), BY_TRUST.len() + 1);
}

#[test]
fn the_arguments_each_encoder_shipped_with_are_unchanged() {
    assert_eq!(
        VIDEOTOOLBOX.encoder_args(Effort::Quality),
        ["-c:v", "h264_videotoolbox", "-realtime", "1", "-b:v", "8000k", "-pix_fmt", "yuv420p"]
    );
    assert_eq!(
        QSV.encoder_args(Effort::Quality),
        ["-c:v", "h264_qsv", "-global_quality", "23", "-look_ahead", "0"]
    );
    assert_eq!(
        VAAPI.encoder_args(Effort::Quality),
        ["-c:v", "h264_vaapi", "-qp", "23"]
    );
    assert_eq!(
        NVENC.encoder_args(Effort::Quality),
        ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23"]
    );
    assert_eq!(
        SOFTWARE.encoder_args(Effort::Quality),
        ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
    );
    assert_eq!(
        V4L2M2M.encoder_args(Effort::Quality),
        ["-c:v", "h264_v4l2m2m", "-b:v", "8000k", "-pix_fmt", "yuv420p"]
    );
}

#[test]
fn a_device_prints_as_its_label() {
    assert_eq!(format!("{VAAPI:?}"), "vaapi");
}
