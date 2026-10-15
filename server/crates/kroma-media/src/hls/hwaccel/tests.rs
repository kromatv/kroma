use super::*;

const EVERY: [HwAccel; 5] = [
    HwAccel::VideoToolbox,
    HwAccel::Qsv,
    HwAccel::Vaapi,
    HwAccel::Nvenc,
    HwAccel::Software,
];

#[test]
fn scales_in_the_memory_each_device_decodes_into() {
    assert_eq!(
        HwAccel::Vaapi
            .video_filter(Some((1920, 1080)), Effort::Quality)
            .unwrap(),
        "scale_vaapi=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
    );
    assert_eq!(
        HwAccel::Qsv
            .video_filter(Some((1280, 720)), Effort::Quality)
            .unwrap(),
        "scale_qsv=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12"
    );
    assert!(HwAccel::Nvenc
        .video_filter(Some((1920, 1080)), Effort::Quality)
        .unwrap()
        .starts_with("scale_cuda="));
    assert!(HwAccel::Software
        .video_filter(Some((1920, 1080)), Effort::Quality)
        .unwrap()
        .starts_with("scale=w=1920"));
}

#[test]
fn fits_inside_the_box_rather_than_stretching_to_it() {
    // Every scaler must keep the shape: a scope frame ends width-limited.
    for accel in EVERY {
        let filter = accel
            .video_filter(Some((1920, 1080)), Effort::Quality)
            .unwrap();

        assert!(
            filter.contains("force_original_aspect_ratio=decrease"),
            "{}: {filter}",
            accel.label()
        );
    }
}

#[test]
fn only_the_scalers_that_run_on_the_cpu_take_the_cheaper_kernel() {
    for accel in [HwAccel::Software, HwAccel::VideoToolbox] {
        let filter = accel
            .video_filter(Some((1920, 1080)), Effort::Realtime)
            .unwrap();

        assert!(
            filter.ends_with(":flags=fast_bilinear"),
            "{}: {filter}",
            accel.label()
        );
    }
    for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
        let filter = accel
            .video_filter(Some((1920, 1080)), Effort::Realtime)
            .unwrap();

        assert!(
            !filter.contains("fast_bilinear"),
            "{}: {filter}",
            accel.label()
        );
    }
}

#[test]
fn drops_the_depth_on_a_device_even_where_nothing_is_resized() {
    // A 10-bit or 4:4:4 source decodes into surfaces no encoder here takes, so a
    // full-size re-encode still needs an 8-bit 4:2:0 format handed over.
    for accel in [HwAccel::Qsv, HwAccel::Vaapi, HwAccel::Nvenc] {
        for size in [None, Some((1920, 1080))] {
            let filter = accel.video_filter(size, Effort::Quality).unwrap();

            assert!(
                filter.contains("format=nv12") || filter.contains("format=yuv420p"),
                "{}: {filter}",
                accel.label()
            );
        }
    }
}

#[test]
fn leaves_the_depth_to_the_encoder_where_the_frames_are_in_system_memory() {
    assert_eq!(HwAccel::Software.video_filter(None, Effort::Quality), None);
    assert_eq!(
        HwAccel::VideoToolbox.video_filter(None, Effort::Quality),
        None
    );
    for accel in [HwAccel::Software, HwAccel::VideoToolbox] {
        assert!(
            accel.encoder_args(Effort::Quality).contains(&"yuv420p"),
            "{}",
            accel.label()
        );
    }
}

#[test]
fn every_device_encodes_to_the_h264_every_target_reads() {
    for accel in EVERY {
        let args = accel.encoder_args(Effort::Quality).join(" ");

        assert!(args.contains("264"), "{}: {args}", accel.label());
    }
}

#[test]
fn the_effort_tier_only_reaches_the_encoder_the_cpu_runs() {
    for accel in [
        HwAccel::VideoToolbox,
        HwAccel::Qsv,
        HwAccel::Vaapi,
        HwAccel::Nvenc,
    ] {
        assert_eq!(
            accel.encoder_args(Effort::Quality),
            accel.encoder_args(Effort::Realtime),
            "{}",
            accel.label()
        );
        assert!(accel.is_device(), "{}", accel.label());
    }
    assert_ne!(
        HwAccel::Software.encoder_args(Effort::Quality),
        HwAccel::Software.encoder_args(Effort::Realtime)
    );
    assert!(!HwAccel::Software.is_device());
}

#[test]
fn a_device_decodes_on_the_device_and_the_cpu_path_takes_the_tiers_flags() {
    assert!(HwAccel::Vaapi
        .input_args(Effort::Quality)
        .contains(&"vaapi"));
    assert!(HwAccel::Software.input_args(Effort::Quality).is_empty());
    assert!(HwAccel::Software
        .input_args(Effort::Realtime)
        .contains(&"-skip_loop_filter"));
}
