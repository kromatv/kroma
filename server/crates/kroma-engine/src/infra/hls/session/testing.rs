//! Fixtures shared by the serving and reclamation test modules: a session
//! with a stand-in child process, and a registry pre-populated with them.

use std::process::Stdio;

use tokio::process::Command;

use super::*;

pub(in crate::infra::hls) const LIVE: Duration = Duration::from_secs(1);

pub(in crate::infra::hls) fn fake_session(dir: PathBuf, age: Duration) -> Arc<Session> {
    let child = Command::new("sleep")
        .arg("30")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn the stand-in child");
    let last = Instant::now().checked_sub(age).expect("monotonic clock older than the test window");
    Arc::new(Session {
        dir,
        child: Mutex::new(child),
        last_access: Mutex::new(last),
        low_seg: AtomicU64::new(u64::MAX),
        pruned: AtomicU64::new(0),
        start: 0.0,
    })
}

// `budget = 0` so only the concurrency cap is exercised. The guard comes back
// with the registry: its segment directories live under that temp root.
pub(in crate::infra::hls) async fn registry(
    name: &str,
    cap: usize,
    sessions: &[(&str, Duration)],
) -> (Sessions, kroma_testing::TempDir) {
    registry_with_budget(name, cap, 0, sessions).await
}

pub(in crate::infra::hls) async fn registry_with_budget(
    name: &str,
    cap: usize,
    budget: u64,
    sessions: &[(&str, Duration)],
) -> (Sessions, kroma_testing::TempDir) {
    let data = kroma_testing::temp_dir(&format!("hls-test-{name}"));
    let s = Sessions::new(data.path(), cap, budget);
    let mut map = s.inner.lock().await;
    for (key, age) in sessions {
        let dir = s.root.join(session_dir(key));
        std::fs::create_dir_all(&dir).expect("session dir");
        map.insert((*key).to_string(), fake_session(dir, *age));
    }
    drop(map);
    (s, data)
}

/// Give a session's directory a measurable size, so the byte budget has
/// something to trim.
pub(in crate::infra::hls) fn fill(s: &Sessions, key: &str, bytes: usize) {
    let dir = s.root.join(session_dir(key));
    std::fs::write(dir.join("seg_00001.m4s"), vec![b'x'; bytes]).expect("segment bytes");
}

pub(in crate::infra::hls) async fn keys(s: &Sessions) -> Vec<String> {
    let mut keys: Vec<String> = s.inner.lock().await.keys().cloned().collect();
    keys.sort();
    keys
}
