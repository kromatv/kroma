//! One continuous ffmpeg per (item, audio-mode), writing fMP4 segments served as
//! it produces them. Per-segment `-ss … -c:v copy -t <dur>` cuts are unreliable on
//! MKV (the cue index is only a keyframe subset, so the copy over-runs and desyncs
//! A/V); one process splits at real keyframes and owns the playlist. A seek the
//! client cannot reach re-anchors by reloading the master at `?t=<secs>`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{info, warn};

use super::{same_program, StreamMode};

const SEGMENT_SECONDS: &str = "6";
const IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const REAP_INTERVAL: Duration = Duration::from_secs(30);
const FILE_WAIT: Duration = Duration::from_secs(20);
// Multiple of realtime ffmpeg may read at, so concurrent sessions don't
// thrash the mount; above 1.0 so clients can still build a forward buffer.
const READRATE: &str = "2.0";
// Seconds read at full speed before READRATE throttling starts (ffmpeg >= 6.1).
const READRATE_BURST: &str = "60";
// Under this age a session counts as actively playing: never evicted to
// reclaim disk, dropped under the concurrency cap only as a last resort.
const BUDGET_GRACE: Duration = Duration::from_secs(45);
// Must exceed the client's forward+back buffer in segments (~30) or a
// backward seek stalls.
const KEEP_BEHIND_SEGS: u64 = 45;

struct Session {
    dir: PathBuf,
    child: Mutex<Child>,
    last_access: Mutex<Instant>,
    max_seg: AtomicU64,
    pruned: AtomicU64,
    // Real stream start (s): the keyframe at-or-before the requested anchor,
    // which the client uses as `baseSec`.
    start: f64,
}

impl Session {
    async fn touch(&self) {
        *self.last_access.lock().await = Instant::now();
    }
    async fn finished(&self) -> bool {
        matches!(self.child.lock().await.try_wait(), Ok(Some(_)))
    }
}

/// Remux sessions keyed per program + anchor (see `session_key`).
pub struct Sessions {
    root: PathBuf,
    cap: usize,
    // On-disk byte budget for the whole cache; 0 = unlimited.
    budget: AtomicU64,
    burst: bool,
    inner: Mutex<HashMap<String, Arc<Session>>>,
}

impl Sessions {
    pub fn new(data_dir: &Path, cap: usize, budget: u64) -> Self {
        let root = data_dir.join("hls");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::create_dir_all(&root);
        Sessions { root, cap: cap.max(1), budget: AtomicU64::new(budget), burst: detect_burst(), inner: Mutex::new(HashMap::new()) }
    }

    /// Retune the disk budget at runtime; 0 = unlimited.
    pub fn set_budget(&self, bytes: u64) {
        self.budget.store(bytes, Ordering::Relaxed);
    }

    pub fn bytes(&self) -> u64 {
        walkdir::WalkDir::new(&self.root)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| e.metadata().ok())
            .map(|m| m.len())
            .sum()
    }

    /// Returns the media playlist bytes plus the real stream start (s) for `baseSec`.
    pub async fn master(&self, key: &str, input: &Path, audio: u32, mode: StreamMode, start_secs: f64) -> Option<(Vec<u8>, f64)> {
        let session = match self.ensure(key, input, audio, mode, start_secs).await {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, session = %key, "failed to start HLS remux");
                return None;
            }
        };
        let start = session.start;
        let path = session.dir.join("index.m3u8");
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                // A media playlist is only valid once it carries a target duration.
                if contains(&bytes, b"#EXT-X-TARGETDURATION") {
                    return Some((bytes, start));
                }
            }
            if Instant::now() >= deadline {
                return tokio::fs::read(&path).await.ok().map(|b| (b, start));
            }
            sleep(Duration::from_millis(80)).await;
        }
    }

    /// A finished playlist gains `#EXT-X-ENDLIST` so it becomes seekable VOD; a
    /// not-yet-produced segment is polled for until ffmpeg flushes it.
    pub async fn file(&self, key: &str, name: &str) -> Option<(Vec<u8>, &'static str)> {
        if !is_safe_name(name) {
            return None;
        }
        let session = { self.inner.lock().await.get(key).cloned() }?;
        session.touch().await;
        if let Some(idx) = seg_index(name) {
            session.max_seg.fetch_max(idx, Ordering::Relaxed);
            // A pruned segment is never reproduced (the remux only moves forward),
            // so 404 now instead of burning FILE_WAIT on a poll that cannot succeed.
            if idx < session.pruned.load(Ordering::Relaxed) {
                return None;
            }
        }
        let path = session.dir.join(name);
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(mut bytes) = tokio::fs::read(&path).await {
                if name.ends_with(".m3u8") && session.finished().await && !contains(&bytes, b"#EXT-X-ENDLIST") {
                    bytes.extend_from_slice(b"#EXT-X-ENDLIST\n");
                }
                return Some((bytes, content_type(name)));
            }
            if Instant::now() >= deadline {
                return None;
            }
            sleep(Duration::from_millis(80)).await;
        }
    }

    async fn ensure(&self, key: &str, input: &Path, audio: u32, mode: StreamMode, start_secs: f64) -> std::io::Result<Arc<Session>> {
        // The anchor is part of the key, so an existing session is always the right one.
        {
            let map = self.inner.lock().await;
            if let Some(s) = map.get(key) {
                s.touch().await;
                return Ok(s.clone());
            }
        }
        // Shells out to ffprobe: must not run under the lock.
        let start = keyframe_before(input, start_secs).await;

        let mut map = self.inner.lock().await;
        if let Some(s) = map.get(key) {
            s.touch().await; // another task created it while we probed
            return Ok(s.clone());
        }
        self.reap_superseded(&mut map, key).await;
        self.make_room(&mut map, key).await;
        let dir = self.root.join(safe_dir(key));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        let child = spawn_stream(input, &dir, audio, mode, start_secs, self.burst)?;
        info!(session = %key, audio, mode = ?mode, anchor = start_secs, start, "started HLS remux");
        let session = Arc::new(Session { dir, child: Mutex::new(child), last_access: Mutex::new(Instant::now()), max_seg: AtomicU64::new(0), pruned: AtomicU64::new(0), start });
        map.insert(key.to_string(), session.clone());
        Ok(session)
    }

    // Victim order under the concurrency cap: a session that has gone quiet, else
    // a sibling of `key` (almost certainly the arriving client's own superseded
    // stream, so no other viewer is cut off), else the plain LRU.
    async fn make_room(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        while map.len() >= self.cap {
            let Some((oldest, la)) = lru(map.iter()).await else { break };
            let victim = if Instant::now().duration_since(la) >= BUDGET_GRACE {
                oldest
            } else {
                lru_sibling(map, key).await.unwrap_or(oldest)
            };
            self.evict(map, &victim).await;
        }
        self.enforce_budget(map).await;
    }

    // A sibling still being read is left alone: the HLS routes are anonymous, so
    // a warm sibling could equally be a second viewer on the same title.
    async fn reap_superseded(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        let now = Instant::now();
        let mut stale = Vec::new();
        for (k, s) in map.iter() {
            let quiet = now.duration_since(*s.last_access.lock().await) >= BUDGET_GRACE;
            if k != key && quiet && same_program(k, key) {
                stale.push(k.clone());
            }
        }
        for k in stale {
            self.evict(map, &k).await;
        }
    }

    // Evict idle sessions oldest-first until the cache is under budget (0
    // disables trimming). A session younger than BUDGET_GRACE is left alone
    // even if that briefly exceeds the budget: dropping its segments would stall it.
    async fn enforce_budget(&self, map: &mut HashMap<String, Arc<Session>>) {
        let budget = self.budget.load(Ordering::Relaxed);
        if budget == 0 {
            return;
        }
        let mut total = self.bytes();
        while total > budget && map.len() > 1 {
            let Some((k, la)) = lru(map.iter()).await else { break };
            if Instant::now().duration_since(la) < BUDGET_GRACE {
                break; // the oldest is live, so the rest are too
            }
            if let Some(s) = map.get(&k) {
                total = total.saturating_sub(dir_bytes(&s.dir));
            }
            self.evict(map, &k).await;
        }
    }

    async fn evict(&self, map: &mut HashMap<String, Arc<Session>>, key: &str) {
        if let Some(s) = map.remove(key) {
            let _ = s.child.lock().await.start_kill();
            let _ = std::fs::remove_dir_all(&s.dir);
        }
    }

    pub fn spawn_reaper(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                sleep(REAP_INTERVAL).await;
                let now = Instant::now();
                let mut map = this.inner.lock().await;
                let mut dead = Vec::new();
                for (id, s) in map.iter() {
                    if now.duration_since(*s.last_access.lock().await) > IDLE_TIMEOUT {
                        dead.push(id.clone());
                    }
                }
                for id in dead {
                    this.evict(&mut map, &id).await;
                }
                // The budget cannot trim a live session, so bound each one here.
                for s in map.values() {
                    prune_behind(s);
                }
                this.enforce_budget(&mut map).await;
            }
        });
    }
}

async fn lru<'a>(sessions: impl Iterator<Item = (&'a String, &'a Arc<Session>)>) -> Option<(String, Instant)> {
    let mut victim: Option<(String, Instant)> = None;
    for (k, s) in sessions {
        let la = *s.last_access.lock().await;
        match &victim {
            Some((_, t)) if *t <= la => {}
            _ => victim = Some((k.clone(), la)),
        }
    }
    victim
}

async fn lru_sibling(map: &HashMap<String, Arc<Session>>, key: &str) -> Option<String> {
    lru(map.iter().filter(|(k, _)| k.as_str() != key && same_program(k, key))).await.map(|(k, _)| k)
}

// The playlist keeps listing pruned entries, but the player never re-fetches them:
// a seek to an un-buffered position re-anchors a fresh session instead.
fn prune_behind(s: &Session) {
    let max = s.max_seg.load(Ordering::Relaxed);
    if max <= KEEP_BEHIND_SEGS {
        return;
    }
    let cutoff = max - KEEP_BEHIND_SEGS;
    s.pruned.fetch_max(cutoff, Ordering::Relaxed);
    let Ok(entries) = std::fs::read_dir(&s.dir) else {
        return;
    };
    for entry in entries.flatten() {
        if let Some(idx) = entry.file_name().to_str().and_then(seg_index) {
            if idx < cutoff {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

fn seg_index(name: &str) -> Option<u64> {
    name.strip_prefix("seg_")?.strip_suffix(".m4s")?.parse().ok()
}

fn dir_bytes(dir: &Path) -> u64 {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

// `-readrate_initial_burst` only exists from ffmpeg 6.1; older builds get a plain
// `-readrate` and a slightly slower first segment.
fn detect_burst() -> bool {
    std::process::Command::new("ffmpeg")
        .args(["-hide_banner", "-h", "full"])
        .output()
        .map(|o| {
            let mut s = o.stdout;
            s.extend_from_slice(&o.stderr);
            contains(&s, b"readrate_initial_burst")
        })
        .unwrap_or(false)
}

async fn keyframe_before(input: &Path, anchor: f64) -> f64 {
    if anchor <= 0.5 {
        return 0.0;
    }
    let from = (anchor - 30.0).max(0.0);
    let out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey"])
        .arg("-read_intervals")
        .arg(format!("{from:.3}%{anchor:.3}"))
        .args(["-show_entries", "frame=pts_time", "-of", "csv=p=0"])
        .arg(input)
        .output()
        .await;
    let Ok(out) = out else {
        return anchor;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut best: Option<f64> = None;
    for line in text.lines() {
        if let Ok(t) = line.trim().trim_end_matches(',').parse::<f64>() {
            if t <= anchor + 0.01 {
                best = Some(best.map_or(t, |b| b.max(t)));
            }
        }
    }
    best.unwrap_or(anchor)
}

// The selected audio track is MUXED into one media playlist rather than exposed as
// an alternate rendition: hls.js keeps playing rendition 0 regardless of selection.
// A language switch is therefore a reload with a different `audio` (a new session).
fn spawn_stream(input: &Path, dir: &Path, audio: u32, mode: StreamMode, start_secs: f64, burst: bool) -> std::io::Result<Child> {
    let mut cmd = Command::new("ffmpeg");
    // `-threads 1`: the remux never decodes video, so a decoder pool is pure overhead.
    cmd.args(["-v", "error", "-nostdin", "-threads", "1"]);
    if start_secs > 0.5 {
        // Required for A/V sync: an accurate seek backs the video to a keyframe but
        // decodes-and-discards audio to the exact `-ss`, starting it a GOP late.
        cmd.arg("-noaccurate_seek").arg("-ss").arg(format!("{start_secs:.3}"));
    }
    // Input option: must come before `-i`.
    cmd.args(["-readrate", READRATE]);
    if burst {
        cmd.args(["-readrate_initial_burst", READRATE_BURST]);
    }
    cmd.arg("-i").arg(input);
    if start_secs > 0.5 {
        cmd.arg("-copyts"); // keep source timestamps so video + audio stay on one timeline
    }
    cmd.args(["-map", "0:v:0"]).arg("-map").arg(format!("0:a:{audio}"));
    cmd.args(["-c:v", "copy"]);
    if mode.transcode() {
        if let Some(af) = mode.filter_chain() {
            cmd.args(["-af", af]);
        }
        cmd.args(["-c:a", "aac", "-ac", "2", "-b:a", "192k"]);
    } else {
        cmd.args(["-c:a", "copy"]);
    }
    cmd.args(["-f", "hls", "-hls_time", SEGMENT_SECONDS])
        .args(["-hls_playlist_type", "event"])
        .args(["-hls_segment_type", "fmp4"])
        .args(["-hls_fmp4_init_filename", "init.mp4"])
        .arg("-hls_segment_filename")
        .arg(dir.join("seg_%05d.m4s"))
        .args(["-hls_flags", "independent_segments+temp_file"])
        .arg(dir.join("index.m3u8"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .kill_on_drop(true);
    match std::fs::File::create(dir.join("ffmpeg.log")) {
        Ok(f) => {
            cmd.stderr(Stdio::from(f));
        }
        Err(_) => {
            cmd.stderr(Stdio::null());
        }
    }
    cmd.spawn()
}

fn content_type(name: &str) -> &'static str {
    if name.ends_with(".m3u8") {
        "application/vnd.apple.mpegurl"
    } else if name.ends_with(".mp4") {
        "video/mp4"
    } else {
        "video/iso.segment"
    }
}

fn is_safe_name(name: &str) -> bool {
    !name.is_empty() && !name.contains("..") && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

fn safe_dir(key: &str) -> String {
    key.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') { c } else { '_' }).collect()
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_name() {
        assert!(is_safe_name("seg_0_00001.m4s"));
        assert!(is_safe_name("init_0.mp4"));
        assert!(!is_safe_name("../x"));
        assert!(!is_safe_name("a/b"));
    }

    #[test]
    fn seg_indices() {
        assert_eq!(seg_index("seg_00042.m4s"), Some(42));
        assert_eq!(seg_index("seg_00000.m4s"), Some(0));
        assert_eq!(seg_index("init.mp4"), None);
        assert_eq!(seg_index("index.m3u8"), None);
        assert_eq!(seg_index("seg_.m4s"), None);
    }

    #[test]
    fn content_types() {
        assert_eq!(content_type("master.m3u8"), "application/vnd.apple.mpegurl");
        assert_eq!(content_type("init_0.mp4"), "video/mp4");
        assert_eq!(content_type("seg_0_00001.m4s"), "video/iso.segment");
    }

    const LIVE: Duration = Duration::from_secs(1);
    const QUIET: Duration = Duration::from_secs(BUDGET_GRACE.as_secs() + 5);

    fn fake_session(dir: PathBuf, age: Duration) -> Arc<Session> {
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
            max_seg: AtomicU64::new(0),
            pruned: AtomicU64::new(0),
            start: 0.0,
        })
    }

    // `budget = 0` so only the concurrency cap is exercised. The guard comes back
    // with the registry: its segment directories live under that temp root.
    async fn registry(
        name: &str,
        cap: usize,
        sessions: &[(&str, Duration)],
    ) -> (Sessions, kroma_testing::TempDir) {
        let data = kroma_testing::temp_dir(&format!("hls-test-{name}"));
        let s = Sessions::new(data.path(), cap, 0);
        let mut map = s.inner.lock().await;
        for (key, age) in sessions {
            let dir = s.root.join(safe_dir(key));
            std::fs::create_dir_all(&dir).expect("session dir");
            map.insert((*key).to_string(), fake_session(dir, *age));
        }
        drop(map);
        (s, data)
    }

    async fn keys(s: &Sessions) -> Vec<String> {
        let mut keys: Vec<String> = s.inner.lock().await.keys().cloned().collect();
        keys.sort();
        keys
    }

    #[tokio::test]
    async fn hard_cap_prefers_the_arriving_clients_own_superseded_sibling() {
        // itA is the LRU; itB toggles the audio filter, minting a third key of its own.
        let (s, _dir) = registry(
            "sibling",
            2,
            &[("itA:copy:0:a0", Duration::from_secs(3)), ("itB:aac:0:a0", LIVE)],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itB:aac-night:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itA:copy:0:a0"]);
        assert!(!s.root.join(safe_dir("itB:aac:0:a0")).exists());
    }

    #[tokio::test]
    async fn hard_cap_evicts_a_quiet_session_before_a_live_sibling() {
        let (s, _dir) = registry("quiet", 2, &[("itA:copy:0:a0", QUIET), ("itB:aac:0:a0", LIVE)]).await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itB:aac-night:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itB:aac:0:a0"]);
    }

    #[tokio::test]
    async fn hard_cap_still_frees_a_slot_when_every_session_is_live_and_unrelated() {
        let (s, _dir) = registry(
            "fallback",
            2,
            &[("itA:copy:0:a0", Duration::from_secs(3)), ("itB:aac:0:a0", LIVE)],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.make_room(&mut map, "itC:copy:0:a0").await;
        }
        assert_eq!(keys(&s).await, ["itB:aac:0:a0"]);
    }

    #[tokio::test]
    async fn superseded_siblings_are_reclaimed_only_once_quiet() {
        let (s, _dir) = registry(
            "supersede",
            8,
            &[
                ("itA:copy:0:a0", QUIET),  // the same program, gone quiet: superseded
                ("itA:aac:600:a0", LIVE),  // the same program but still being read
                ("itA:copy:0:a1", QUIET),  // another language track = another program
                ("itB:copy:0:a0", QUIET),  // another title
            ],
        )
        .await;
        {
            let mut map = s.inner.lock().await;
            s.reap_superseded(&mut map, "itA:aac-night:900:a0").await;
        }
        assert_eq!(keys(&s).await, ["itA:aac:600:a0", "itA:copy:0:a1", "itB:copy:0:a0"]);
        assert!(!s.root.join(safe_dir("itA:copy:0:a0")).exists());
    }
}
