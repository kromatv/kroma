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

mod admission;
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
mod session;
mod software;
mod window;

pub use admission::Refusal;
pub use hwaccel::{prime as prime_hwaccel, Detection};
pub use live::Transcode;
pub use mode::{AudioMode, Rung, StreamMode, VideoMode};

use std::path::{Path, PathBuf};
use std::sync::Arc;

use key::session_key;
use session::Sessions;

pub struct HlsEngine {
    sessions: Arc<Sessions>,
    durations: std::sync::Mutex<std::collections::HashMap<String, Option<u64>>>,
}

impl HlsEngine {
    /// `root` is the directory the engine writes its sessions in, and it is
    /// emptied on construction. `max_concurrent` hard-caps live sessions;
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
    pub async fn input_duration_ms(&self, input: &str) -> Option<u64> {
        if let Some(known) = self.durations.lock().unwrap().get(input).copied() {
            return known;
        }
        let path = input.to_string();
        let read = tokio::task::spawn_blocking(move || {
            crate::probe::probe_duration_ms(Path::new(&path))
        })
        .await
        .ok()
        .flatten();
        self.durations
            .lock()
            .unwrap()
            .insert(input.to_string(), read);
        read
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
    ) -> Result<(String, f64), Refusal> {
        let key = session_key(item_id, mode, anchor, audio);
        let (bytes, start) = self
            .sessions
            .master(&key, Path::new(input), audio, mode, anchor as f64, source)
            .await?;
        let playlist = String::from_utf8(bytes).map_err(|_| Refusal::Unavailable)?;
        Ok((playlist, start))
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
mod tests;
