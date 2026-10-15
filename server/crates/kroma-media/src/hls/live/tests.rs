use super::super::hwaccel::HwAccel;
use super::super::software::Effort;
use super::super::Rung;
use super::*;

fn plan(key: &str, mode: StreamMode, accel: HwAccel) -> Plan {
    Plan::new(
        key,
        1,
        mode,
        Pipeline {
            accel,
            effort: Effort::Realtime,
        },
        Some((3840, 2160)),
        Some(4242),
        30.0,
    )
}

fn seeded_dir(name: &str) -> (kroma_testing::TempDir, std::path::PathBuf) {
    let data = kroma_testing::temp_dir(name);
    let dir = data.path().join("s");
    std::fs::create_dir_all(&dir).expect("session dir");
    (data, dir)
}

#[test]
fn a_downscale_reports_the_box_it_is_fitting_the_picture_into() {
    let (_data, dir) = seeded_dir("hls-live-box");
    let mode = StreamMode::new(VideoMode::H264At(Rung::P1080), AudioMode::Aac);

    let t = report(
        &plan("it1:h264-1080-aac:30:a1", mode, HwAccel::Vaapi),
        &dir,
        true,
    );

    assert_eq!(t.video, "h264-1080");
    assert_eq!((t.target_width, t.target_height), (Some(1920), Some(1080)));
    assert_eq!((t.source_width, t.source_height), (Some(3840), Some(2160)));
    assert!(t.transcodes_video);
    assert!(t.transcodes_audio);
    assert_eq!(t.accel, "vaapi");
    assert!(!t.on_the_cpu);
    assert_eq!(t.item_id, "it1");
    assert_eq!(t.pid, Some(4242));
}

#[test]
fn a_stream_copy_says_it_is_costing_the_box_nothing() {
    let (_data, dir) = seeded_dir("hls-live-copy");
    let mode = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

    let t = report(&plan("it1:copy:0:a1", mode, HwAccel::Software), &dir, true);

    assert_eq!(t.video, "copy");
    assert!(!t.transcodes_video);
    assert!(!t.transcodes_audio);
    assert_eq!((t.target_width, t.target_height), (None, None));
    assert!(
        t.on_the_cpu,
        "software is the pipeline even where nothing re-encodes"
    );
}

#[test]
fn the_rate_the_encoder_is_holding_comes_from_the_progress_file() {
    let (_data, dir) = seeded_dir("hls-live-speed");
    std::fs::write(
        dir.join(progress::FILE),
        "frame=300\nfps=25.00\nout_time_us=12000000\ndrop_frames=2\n\
         speed=0.42x\nprogress=continue\n",
    )
    .expect("progress file");

    let mode = StreamMode::new(VideoMode::H264, AudioMode::Aac);
    let t = report(
        &plan("it1:h264-aac:0:a1", mode, HwAccel::Software),
        &dir,
        true,
    );

    assert!(
        (t.speed - 0.42).abs() < 1e-3,
        "the box is losing to the film"
    );
    assert_eq!(t.frames, 300);
    assert_eq!(t.dropped, 2);
    assert_eq!(t.out_time_ms, 12_000);
}

#[test]
fn a_session_with_no_progress_file_yet_reports_zeroes_rather_than_nothing() {
    let (_data, dir) = seeded_dir("hls-live-early");
    let mode = StreamMode::new(VideoMode::H264, AudioMode::Copy);

    let t = report(
        &plan("it1:h264-copy:0:a1", mode, HwAccel::Software),
        &dir,
        true,
    );

    assert_eq!(t.speed, 0.0);
    assert_eq!(t.segments, 0);
    assert!(t.running);
}

#[test]
fn segments_are_counted_apart_from_everything_else_in_the_directory() {
    let (_data, dir) = seeded_dir("hls-live-stats");
    for name in ["seg_00001.m4s", "seg_00002.m4s", "init.mp4", "index.m3u8"] {
        std::fs::write(dir.join(name), vec![b'x'; 100]).expect("file");
    }

    let (segments, bytes) = dir_stats(&dir);

    assert_eq!(segments, 2);
    assert_eq!(
        bytes, 400,
        "every file counts toward the disk it is holding"
    );
}

#[test]
fn a_finished_run_stops_reading_as_running() {
    let (_data, dir) = seeded_dir("hls-live-done");
    std::fs::write(
        dir.join(progress::FILE),
        "frame=9\nspeed=2.0x\nprogress=end\n",
    )
    .expect("progress file");

    let mode = StreamMode::new(VideoMode::Copy, AudioMode::Aac);
    let t = report(&plan("it1:aac:0:a1", mode, HwAccel::Software), &dir, true);

    assert!(!t.running);
}
