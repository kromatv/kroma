//! On-demand HLS delivery.
//!
//! Direct-play (raw byte range, [`crate::stream`]) is the default; this
//! covers what a browser can't direct-play: MKV→fMP4 repackaging, audio it
//! can't decode (AC3/EAC3/DTS → AAC), video it can't decode (HEVC → H.264), and
//! language switching. A thin wrapper over a [`session`] registry: one
//! continuous ffmpeg per (item, mode, anchor) produces a complete-program HLS
//! master. The anchor is part of both the session key and the URL path, so two
//! anchors never write each other's segment names; a re-anchor into a second one
//! of them has already produced is answered out of it ([`covered`]) rather than
//! sharing a session.

mod covered;
mod cut;
mod ffmpeg;
mod fit;
mod hwaccel;
mod key;
mod live;
mod mode;
mod naming;
mod progress;
mod reclaim;
mod root;
mod session;
mod software;
mod window;

pub use hwaccel::{prime as prime_hwaccel, Detection};
pub use live::Transcode;
pub use mode::{AudioMode, Rung, StreamMode, VideoMode};

use std::path::{Path, PathBuf};
use std::sync::Arc;

use key::session_key;
use session::Sessions;

const DURATION_WAIT: std::time::Duration = std::time::Duration::from_secs(10);

/// The operator setting that sizes a session cache, and what it means where
/// nothing is set. A module reads the same key as the core, so one knob moves
/// every engine on the box.
pub const MAX_CONCURRENT_KEY: &str = "maxConcurrent";
pub const DEFAULT_MAX_CONCURRENT: i64 = 8;

/// How many live sessions [`MAX_CONCURRENT_KEY`] asks a cache to keep, held to
/// 1..=32.
pub fn live_sessions(setting: i64) -> usize {
    setting.clamp(1, 32) as usize
}

pub struct HlsEngine {
    sessions: Arc<Sessions>,
    durations: std::sync::Mutex<std::collections::HashMap<String, u64>>,
}

impl HlsEngine {
    /// `root` is the directory the engine writes its sessions in, and it is
    /// emptied on construction: an engine derives no path of its own, because two
    /// of them in two processes over one data directory would each delete the
    /// other's live sessions. `max_concurrent` hard-caps live sessions;
    /// `cache_budget` is the on-disk byte budget that trims idle / superseded
    /// sessions (0 = unlimited).
    pub fn new(root: PathBuf, max_concurrent: usize, cache_budget: u64) -> Self {
        HlsEngine {
            sessions: Arc::new(Sessions::new(root, max_concurrent, cache_budget)),
            durations: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// True media duration (ms) of the input, ffprobed once (duration-only,
    /// header read) and kept. Lets the player show the real length when the
    /// catalog row was never probed: otherwise the growing EVENT playlist's
    /// duration is all the client can see (it reads the live edge as the total).
    ///
    /// Only an answer is kept. An input that has not yet arrived far enough to
    /// carry one is asked again on the next reload, and the ffprobe behind the
    /// question is given [`DURATION_WAIT`] and no longer.
    pub async fn input_duration_ms(&self, input: &str) -> Option<u64> {
        if let Some(known) = self.durations.lock().unwrap().get(input).copied() {
            return Some(known);
        }
        let read = crate::probe::duration_ms_within(input, DURATION_WAIT).await?;
        self.durations
            .lock()
            .unwrap()
            .insert(input.to_string(), read);
        Some(read)
    }

    pub fn spawn_reaper(&self) {
        self.sessions.spawn_reaper();
    }

    pub fn cache_bytes(&self) -> u64 {
        self.sessions.bytes()
    }

    /// Retune the on-disk cache byte budget at runtime (0 = unlimited).
    pub fn set_cache_budget(&self, bytes: u64) {
        self.sessions.set_budget(bytes);
    }

    /// The media playlist for `item_id` in `mode`, anchored at `anchor` seconds
    /// (input `-ss`, 0 = start), muxing the `audio`-th audio track. Returns the
    /// playlist text + the REAL stream start (s) - the keyframe at-or-before
    /// `anchor` - for the client's `baseSec`.
    ///
    /// `source` is the file's own frame size where the catalog knows it, which is
    /// what a re-encode has to decode before it can encode anything.
    pub async fn master(
        &self,
        item_id: &str,
        input: &str,
        audio: u32,
        mode: StreamMode,
        anchor: u64,
        source: Option<(u32, u32)>,
    ) -> Option<(String, f64)> {
        let key = session_key(item_id, mode, anchor, audio);
        let (bytes, start) = self
            .sessions
            .master(&key, Path::new(input), audio, mode, anchor as f64, source)
            .await?;
        Some((String::from_utf8(bytes).ok()?, start))
    }

    /// Every remux running right now, newest first: what it is producing, on
    /// what silicon, and whether it is keeping ahead of the player.
    pub async fn live(&self) -> Vec<Transcode> {
        self.sessions.live().await
    }

    /// The pipeline this host settled on for re-encodes, and the sentence that
    /// explains it. A device that is present, listed and unusable looks exactly
    /// like no device at all, and the reason is the only thing that separates them.
    pub fn hardware() -> &'static Detection {
        hwaccel::detected()
    }

    /// A child file (init or segment) of the `(mode, anchor, audio)` session.
    pub async fn file(
        &self,
        item_id: &str,
        mode: StreamMode,
        anchor: u64,
        audio: u32,
        name: &str,
    ) -> Option<(Vec<u8>, &'static str)> {
        let key = session_key(item_id, mode, anchor, audio);
        self.sessions.file(&key, name).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_length_the_input_did_not_answer_is_not_remembered_as_its_length() {
        let data = kroma_testing::temp_dir("hls-duration");
        let engine = HlsEngine::new(data.path().join("hls"), 1, 0);

        let read = engine
            .input_duration_ms("http://127.0.0.1:1/clip.mp4")
            .await;

        assert_eq!(read, None);
        assert!(engine.durations.lock().unwrap().is_empty());
    }
}
