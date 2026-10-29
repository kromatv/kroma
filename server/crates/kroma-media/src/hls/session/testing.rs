//! Fixtures shared by the serving and reclamation test modules: a session
//! with a stand-in child process, and a registry pre-populated with them.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::process::Command;
use tokio::sync::Mutex;

use super::super::hwaccel::{HwAccel, Pipeline};
use super::super::live::Plan;
use super::super::naming::session_dir;
use super::super::software::Effort;
use super::super::window::Window;
use super::super::{AudioMode, StreamMode, VideoMode};
use super::{Session, Sessions};

pub(in crate::hls) const LIVE: Duration = Duration::from_secs(1);

pub(in crate::hls) const PLAYLIST: &str = "#EXTM3U\n\
    #EXT-X-VERSION:7\n\
    #EXT-X-TARGETDURATION:6\n\
    #EXT-X-MEDIA-SEQUENCE:0\n\
    #EXT-X-PLAYLIST-TYPE:EVENT\n\
    #EXT-X-MAP:URI=\"init.mp4\"\n\
    #EXTINF:6.000000,\n\
    seg_00000.m4s\n\
    #EXTINF:6.000000,\n\
    seg_00001.m4s\n\
    #EXTINF:4.000000,\n\
    seg_00002.m4s\n";

fn mode_of(key: &str) -> StreamMode {
    key.rsplit_once(':')
        .and_then(|(head, _audio)| head.rsplit_once(':'))
        .and_then(|(head, _anchor)| head.rsplit_once(':'))
        .and_then(|(_item, mode)| StreamMode::parse(mode))
        .unwrap_or(StreamMode::new(VideoMode::Copy, AudioMode::Copy))
}

pub(in crate::hls) fn fake_session(
    key: &str,
    dir: PathBuf,
    age: Duration,
    opener: Option<&str>,
) -> Arc<Session> {
    let child = Command::new("sleep")
        .arg("30")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn the stand-in child");
    let last = Instant::now()
        .checked_sub(age)
        .expect("monotonic clock older than the test window");
    let plan = Plan::new(
        key,
        0,
        mode_of(key),
        Pipeline {
            accel: HwAccel::Software,
            effort: Effort::Quality,
        },
        None,
        child.id(),
        0.0,
    );
    Arc::new(Session {
        dir,
        child: Mutex::new(child),
        last_access: Mutex::new(last),
        window: Window::new(),
        plan,
        start: 0.0,
        opener: opener.map(str::to_owned),
        superseded: std::sync::atomic::AtomicBool::new(false),
        _cpu: None,
    })
}

// `budget = 0` so only the concurrency cap is exercised. The guard comes back
// with the registry: its segment directories live under that temp root.
pub(in crate::hls) async fn registry(
    name: &str,
    cap: usize,
    sessions: &[(&str, Duration)],
) -> (Sessions, kroma_testing::TempDir) {
    registry_with_budget(name, cap, 0, sessions).await
}

pub(in crate::hls) async fn registry_with_budget(
    name: &str,
    cap: usize,
    budget: u64,
    sessions: &[(&str, Duration)],
) -> (Sessions, kroma_testing::TempDir) {
    let data = kroma_testing::temp_dir(&format!("hls-test-{name}"));
    let s = Sessions::new(data.path().join("hls"), cap, budget);
    for (key, age) in sessions {
        seed(&s, key, *age, None).await;
    }
    (s, data)
}

pub(in crate::hls) async fn seed(s: &Sessions, key: &str, age: Duration, opener: Option<&str>) {
    let dir = s.root.join(session_dir(key));
    tokio::fs::create_dir_all(&dir).await.expect("session dir");
    s.inner
        .lock()
        .await
        .insert(key.to_string(), fake_session(key, dir, age, opener));
}

/// Give a session's directory a measurable size, so the byte budget has
/// something to trim.
pub(in crate::hls) fn fill(s: &Sessions, key: &str, bytes: usize) {
    let dir = s.root.join(session_dir(key));
    std::fs::write(dir.join("seg_00001.m4s"), vec![b'x'; bytes]).expect("segment bytes");
}

pub(in crate::hls) async fn keys(s: &Sessions) -> Vec<String> {
    let mut keys: Vec<String> = s.inner.lock().await.keys().cloned().collect();
    keys.sort();
    keys
}
