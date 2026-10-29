//! One continuous ffmpeg per (item, audio-mode), writing fMP4 segments served as
//! it produces them. Per-segment `-ss … -c:v copy -t <dur>` cuts are unreliable on
//! MKV (the cue index is only a keyframe subset, so the copy over-runs and desyncs
//! A/V); one process splits at real keyframes and owns the playlist. A seek the
//! client cannot reach re-anchors by reloading the master at `?t=<secs>`.
//!
//! This half starts sessions and serves out of them; [`super::reclaim`] is what
//! takes them away again, and [`super::live`] is what the admin sees of them.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{info, warn};

use super::admission::{max_live_transcodes, Refusal};
use super::Asked;
use super::covered::Serving;
use super::ffmpeg::{detect_burst, keyframe_before, spawn_stream};
use super::hwaccel::Pipeline;
use super::live::Plan;
use super::naming::{contains, content_type, is_safe_name, seg_index, session_dir};
use super::window::Window;
use super::{StreamMode, VideoMode};
use crate::ffmpeg_gate;

const FILE_WAIT: Duration = Duration::from_secs(20);

pub(super) struct Session {
    pub(super) dir: PathBuf,
    pub(super) child: Mutex<Child>,
    pub(super) last_access: Mutex<Instant>,
    pub(super) window: Window,
    // How this session was started, so the admin can be told what the box is
    // spending its cycles on without re-deriving it from the key.
    pub(super) plan: Plan,
    // Real stream start (s): the keyframe at-or-before the requested anchor,
    // which the client uses as `baseSec`.
    pub(super) start: f64,
    pub(super) opener: Option<String>,
    pub(super) superseded: AtomicBool,
    // Held only where the picture is re-encoded on the CPU, and dropped with the
    // session: for as long as it lives, background media passes are held to one
    // at a time (see [`crate::ffmpeg_gate`]).
    _cpu: Option<ffmpeg_gate::Reservation>,
}

impl Session {
    async fn touch(&self) {
        *self.last_access.lock().await = Instant::now();
        self.keep();
    }

    pub(super) async fn finished(&self) -> bool {
        matches!(self.child.lock().await.try_wait(), Ok(Some(_)))
    }

    pub(super) fn transcodes_video(&self) -> bool {
        self.plan.transcodes_video()
    }

    pub(super) fn is_superseded_transcode(&self) -> bool {
        self.superseded.load(std::sync::atomic::Ordering::Relaxed) && self.transcodes_video()
    }

    pub(super) fn opened_by(&self, opener: Option<&str>) -> bool {
        match (self.opener.as_deref(), opener) {
            (Some(mine), Some(asking)) => mine == asking,
            _ => false,
        }
    }
}

/// Remux sessions keyed per program + anchor (see `session_key`).
pub struct Sessions {
    pub(super) root: PathBuf,
    pub(super) cap: usize,
    pub(super) transcode_cap: usize,
    // On-disk byte budget for the whole cache; 0 = unlimited.
    pub(super) budget: AtomicU64,
    burst: bool,
    pub(super) inner: Mutex<HashMap<String, Arc<Session>>>,
    pub(super) serving: Serving,
}

impl Sessions {
    pub fn new(root: PathBuf, cap: usize, budget: u64) -> Self {
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::create_dir_all(&root);
        let cap = cap.max(1);
        Sessions {
            root,
            cap,
            transcode_cap: max_live_transcodes().min(cap),
            budget: AtomicU64::new(budget),
            burst: detect_burst(),
            inner: Mutex::new(HashMap::new()),
            serving: Serving::default(),
        }
    }

    /// Retune the disk budget at runtime; 0 = unlimited.
    pub fn set_budget(&self, bytes: u64) {
        self.budget
            .store(bytes, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn bytes(&self) -> u64 {
        super::reclaim::dir_bytes(&self.root)
    }

    /// Returns the media playlist bytes plus the real stream start (s) for `baseSec`.
    pub async fn master(
        self: &Arc<Self>,
        key: &str,
        asked: &Asked<'_>,
    ) -> Result<(Vec<u8>, f64), Refusal> {
        let start_secs = asked.anchor as f64;
        if let Some(reused) = self.reuse(key, start_secs).await {
            reused.session.touch().await;
            self.serving.note(key, &reused.key).await;
            info!(session = %key, serving = %reused.key, "answered a re-anchor out of a running session");
            return Ok((ended(&reused.session, reused.playlist).await, reused.start));
        }
        self.serving.forget(key).await;
        let session = self.ensure(key, asked).await?;
        let start = session.start;
        let path = session.dir.join("index.m3u8");
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                // A media playlist is only valid once it carries a target duration.
                if contains(&bytes, b"#EXT-X-TARGETDURATION") {
                    return Ok((bytes, start));
                }
            }
            if Instant::now() >= deadline {
                return tokio::fs::read(&path)
                    .await
                    .map(|b| (b, start))
                    .map_err(|_| Refusal::Unavailable);
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
        let session = self.serving_session(key).await?;
        session.touch().await;
        let idx = seg_index(name);
        // A pruned segment is never reproduced (the remux only moves forward), so
        // 404 now instead of burning FILE_WAIT on a poll that cannot succeed.
        if idx.is_some_and(|i| !session.window.note(i)) {
            return None;
        }
        let path = session.dir.join(name);
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                let bytes = if name.ends_with(".m3u8") {
                    ended(&session, bytes).await
                } else {
                    bytes
                };
                return Some((bytes, content_type(name)));
            }
            // A reap during the wait can delete what this poll is waiting for.
            if idx.is_some_and(|i| session.window.is_pruned(i)) {
                return None;
            }
            if Instant::now() >= deadline {
                return None;
            }
            sleep(Duration::from_millis(80)).await;
        }
    }

    async fn ensure(self: &Arc<Self>, key: &str, asked: &Asked<'_>) -> Result<Arc<Session>, Refusal> {
        let (input, mode, source) = (Path::new(asked.input), asked.mode, asked.source);
        let (audio, start_secs) = (asked.audio, asked.anchor as f64);
        // The anchor is part of the key, so an existing session is always the right one.
        {
            let map = self.inner.lock().await;
            if let Some(s) = map.get(key) {
                s.touch().await;
                return Ok(s.clone());
            }
        }
        if self.retire_superseded(key, asked.opener).await {
            self.reclaim_superseded_later();
        }
        // Both shell out on their first call: must not run under the lock.
        let start = keyframe_before(input, start_secs).await;
        // Off the reactor: the first call makes every candidate device encode a
        // test frame, and this one runs inside the request that starts a session.
        let target = mode.video.box_size();
        let pipeline = tokio::task::spawn_blocking(move || Pipeline::choose(source, target))
            .await
            .unwrap_or_else(|_| Pipeline::choose(source, target));
        // The one case worth taking the box away from background work: no device,
        // and a picture that has to be rebuilt frame by frame while someone waits.
        let on_the_cpu = pipeline.on_the_cpu() && !matches!(mode.video, VideoMode::Copy);

        let mut map = self.inner.lock().await;
        if let Some(s) = map.get(key) {
            s.touch().await; // another task created it while we probed
            return Ok(s.clone());
        }
        self.make_room(&mut map).await;
        if !matches!(mode.video, VideoMode::Copy) && !self.admits_transcode(&mut map).await {
            warn!(session = %key, cap = self.transcode_cap, "refused a re-encode: every slot is taken");
            return Err(Refusal::Busy);
        }
        let dir = self.root.join(session_dir(key));
        super::reclaim::discard_dir(&dir);
        let child = match self
            .spawn_into(&dir, input, audio, mode, start_secs, pipeline)
            .await
        {
            Ok(child) => child,
            Err(e) => {
                warn!(error = %e, session = %key, "failed to start HLS remux");
                return Err(Refusal::Unavailable);
            }
        };
        info!(session = %key, audio, mode = ?mode, anchor = start_secs, start, accel = pipeline.accel.label(), effort = pipeline.effort.label(), "started HLS remux");
        let session = Arc::new(Session {
            plan: Plan::new(key, audio, mode, pipeline, source, child.id(), start_secs),
            dir,
            child: Mutex::new(child),
            last_access: Mutex::new(Instant::now()),
            window: Window::new(),
            start,
            opener: asked.opener.map(str::to_owned),
            superseded: AtomicBool::new(false),
            _cpu: on_the_cpu.then(ffmpeg_gate::reserve),
        });
        map.insert(key.to_string(), session.clone());
        Ok(session)
    }

    async fn spawn_into(
        &self,
        dir: &Path,
        input: &Path,
        audio: u32,
        mode: StreamMode,
        start_secs: f64,
        pipeline: Pipeline,
    ) -> std::io::Result<Child> {
        tokio::fs::create_dir_all(dir).await?;
        spawn_stream(input, dir, audio, mode, start_secs, self.burst, pipeline)
    }

    async fn retire_superseded(&self, key: &str, opener: Option<&str>) -> bool {
        let mut map = self.inner.lock().await;
        self.reap_superseded(&mut map, key, opener).await
    }

    async fn serving_session(&self, key: &str) -> Option<Arc<Session>> {
        if let Some(session) = self.inner.lock().await.get(key).cloned() {
            return Some(session);
        }
        let serving = self.serving.answering(key).await?;
        self.inner.lock().await.get(&serving).cloned()
    }
}

// A finished remux writes no `#EXT-X-ENDLIST` of its own under an EVENT
// playlist, and without one the playlist is never seekable VOD to a player.
async fn ended(session: &Session, mut playlist: Vec<u8>) -> Vec<u8> {
    if session.finished().await && !contains(&playlist, b"#EXT-X-ENDLIST") {
        playlist.extend_from_slice(b"#EXT-X-ENDLIST\n");
    }
    playlist
}

#[cfg(test)]
pub(super) mod testing;
