use std::time::Duration;

use super::*;
use crate::input;

const COPY: StreamMode = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

fn engine(root: &Path) -> HlsEngine {
    HlsEngine::new(root.join("hls"), 2, 0)
}

fn asked<'a>(input: &'a Path, anchor: u64) -> Asked<'a> {
    Asked {
        item_id: "it1",
        input: input.to_str().unwrap(),
        opener: None,
        audio: 0,
        mode: COPY,
        anchor,
        source: Some((320, 180)),
    }
}

async fn remux(engine: &HlsEngine, input: &Path) -> String {
    engine
        .master(asked(input, 0))
        .await
        .expect("a playlist out of a file ffmpeg can read")
        .0
}

async fn finished_playlist(engine: &HlsEngine) -> String {
    for _ in 0..200 {
        let Some((bytes, _)) = engine.file("it1", COPY, 0, 0, "index.m3u8").await else {
            panic!("the session went away while its playlist was being read");
        };
        let text = String::from_utf8(bytes).expect("a text playlist");
        if text.contains("#EXT-X-ENDLIST") {
            return text;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the remux never finished the clip");
}

#[tokio::test]
async fn the_length_a_file_carries_is_read_once_and_kept() {
    let dir = kroma_testing::temp_dir("hls-duration");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    let path = input.to_str().unwrap();

    let first = engine.input_duration_ms(path).await;
    let again = engine.input_duration_ms(path).await;

    assert_eq!(first, again);
    assert!(
        matches!(first, Some(ms) if (4_000..6_000).contains(&ms)),
        "read {first:?} off a five second clip"
    );
}

#[tokio::test]
async fn a_file_nothing_can_open_has_no_length_and_is_not_probed_twice() {
    let dir = kroma_testing::temp_dir("hls-no-duration");
    let engine = engine(dir.path());

    let first = engine.input_duration_ms("/nowhere/absent.mkv").await;
    let again = engine.input_duration_ms("/nowhere/absent.mkv").await;

    assert_eq!(first, None);
    assert_eq!(again, None);
}

#[tokio::test]
async fn what_a_session_wrote_is_what_the_cache_weighs() {
    let dir = kroma_testing::temp_dir("hls-bytes");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());

    remux(&engine, &input).await;

    assert!(engine.cache_bytes() > 0);
}

#[tokio::test]
async fn the_disk_budget_is_retuned_without_restarting_the_engine() {
    let dir = kroma_testing::temp_dir("hls-budget");
    let engine = engine(dir.path());

    engine.set_cache_budget(4 * 1024 * 1024);
    engine.spawn_reaper();

    assert_eq!(engine.cache_bytes(), 0);
}

#[tokio::test]
async fn a_running_remux_says_what_it_is_producing_and_on_what_silicon() {
    let dir = kroma_testing::temp_dir("hls-live");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());

    remux(&engine, &input).await;

    let live = engine.live().await;
    assert_eq!(live.len(), 1);
    assert_eq!(live[0].item_id, "it1");
    assert_eq!(live[0].video, "copy");
    assert_eq!(live[0].audio, "copy");
    assert_eq!(live[0].source_width, Some(320));
    assert!(!live[0].transcodes_video);
}

#[test]
fn the_pipeline_this_host_settled_on_comes_with_the_reason_for_it() {
    let hardware = HlsEngine::hardware();

    assert!(!hardware.reason.is_empty());
    assert_eq!(hardware.accel, HlsEngine::hardware().accel);
}

#[tokio::test]
async fn a_child_name_reaching_out_of_the_session_is_refused_outright() {
    let dir = kroma_testing::temp_dir("hls-escape");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    remux(&engine, &input).await;

    let escaped = engine.file("it1", COPY, 0, 0, "../../etc/passwd").await;

    assert!(escaped.is_none());
}

#[tokio::test]
async fn a_finished_remux_is_seekable_vod_rather_than_a_live_edge() {
    let dir = kroma_testing::temp_dir("hls-endlist");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    remux(&engine, &input).await;

    let finished = finished_playlist(&engine).await;

    assert!(finished.contains("#EXT-X-TARGETDURATION"));
    assert!(finished.contains("seg_00000.m4s"));
}

#[tokio::test]
async fn a_segment_served_out_of_a_session_knows_what_it_is() {
    let dir = kroma_testing::temp_dir("hls-segment");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    remux(&engine, &input).await;
    finished_playlist(&engine).await;

    let init = engine.file("it1", COPY, 0, 0, "init.mp4").await;
    let segment = engine.file("it1", COPY, 0, 0, "seg_00000.m4s").await;

    assert_eq!(init.map(|(_, ct)| ct), Some("video/mp4"));
    assert_eq!(segment.map(|(_, ct)| ct), Some("video/iso.segment"));
}

fn session_dirs(root: &Path) -> usize {
    std::fs::read_dir(root.join("hls"))
        .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).count())
        .unwrap_or(0)
}

#[tokio::test]
async fn a_re_anchor_into_a_session_already_running_is_answered_out_of_it() {
    let dir = kroma_testing::temp_dir("hls-reanchor");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    remux(&engine, &input).await;
    finished_playlist(&engine).await;

    let (playlist, start) = engine
        .master(asked(&input, 2))
        .await
        .expect("the anchor sits inside what the running session has produced");

    assert_eq!(session_dirs(dir.path()), 1, "no second ffmpeg was started");
    assert_eq!(start, 0.0, "the client is told where the stream it gets begins");
    assert!(playlist.contains("seg_00000.m4s"));
}

fn keyed_every_two_seconds(dir: &Path, name: &str, clock_starts_at: f64) -> PathBuf {
    let at = dir.join(name);
    let status = std::process::Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-y"])
        .args(input::generated("testsrc=size=64x48:rate=25:duration=20"))
        .args(input::generated("sine=frequency=440:duration=20"))
        .args(["-c:v", "libx264", "-g", "50"])
        .args(["-keyint_min", "50", "-sc_threshold", "0"])
        .args(["-c:a", "aac", "-shortest"])
        .arg("-output_ts_offset")
        .arg(clock_starts_at.to_string())
        .arg(&at)
        .status()
        .expect("run ffmpeg");
    assert!(status.success(), "ffmpeg could not write the fixture clip");
    at
}

fn first_frame_on_disk(engine: &HlsEngine, anchor: u64) -> f64 {
    let key = session_key("it1", COPY, anchor, 0);
    let dir = engine.sessions.root.join(naming::session_dir(&key));
    let first = dir.join("first.mp4");
    let mut bytes = std::fs::read(dir.join("init.mp4")).expect("an init segment");
    bytes.extend(std::fs::read(dir.join("seg_00000.m4s")).expect("a first segment"));
    std::fs::write(&first, bytes).expect("write the first segment whole");
    let out = std::process::Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0"])
        .args(["-show_entries", "packet=pts_time"])
        .args(["-read_intervals", "%+#1", "-of", "csv=p=0"])
        .args(input::file(&first))
        .output()
        .expect("run ffprobe");
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse()
        .expect("a first frame in the first segment")
}

#[tokio::test]
async fn a_stream_asked_for_on_a_keyframe_is_placed_where_ffmpeg_began_it() {
    let dir = kroma_testing::temp_dir("hls-start-on-keyframe");
    let input = keyed_every_two_seconds(dir.path(), "clip.mkv", 0.0);
    let engine = engine(dir.path());

    let (_, start) = engine
        .master(asked(&input, 10))
        .await
        .expect("a playlist out of a file ffmpeg can read");

    assert_eq!(start, first_frame_on_disk(&engine, 10));
}

#[tokio::test]
async fn a_file_whose_clock_starts_late_is_answered_on_the_film_s_own_clock() {
    let dir = kroma_testing::temp_dir("hls-start-late-clock");
    let input = keyed_every_two_seconds(dir.path(), "clip.mkv", 8.7);
    let engine = engine(dir.path());

    let (_, start) = engine
        .master(asked(&input, 11))
        .await
        .expect("a playlist out of a file ffmpeg can read");

    assert!((start - 10.0).abs() < 0.05, "{start}");
    assert_eq!(start, first_frame_on_disk(&engine, 11));
}
