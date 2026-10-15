//! The live-session store: the heartbeat map and its upsert/list/reap lifecycle.
//! An ended session is handed to [`history::record`] on the way out.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::db::Pool;
use crate::infra::events::{Bus, ServerEvent};
use crate::model::MediaItem;

use super::playing::Playing;

mod history;

pub use history::record;
use history::unix_now;

// Clients heartbeat every ~10s, so this tolerates a couple of missed beats.
const SESSION_TTL: Duration = Duration::from_secs(30);
const PLAYING: &str = "playing";
const REAP_INTERVAL: Duration = Duration::from_secs(10);

pub struct Ping {
    pub session_id: String,
    pub playing: Playing,
    pub position_ms: i64,
    pub duration_ms: Option<i64>,
    pub state: String,
    pub mode: String,
    pub player: String,
    pub device: String,
    pub audio: Option<String>,
    pub subtitle: Option<String>,
}

/// A live playback session, serialized for the admin API.
#[derive(Clone, Serialize)]
pub struct Session {
    pub id: String,
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    pub username: String,
    #[serde(flatten)]
    pub playing: Playing,
    pub title: String,
    pub year: Option<u32>,
    pub kind: String,
    #[serde(rename = "showTitle", skip_serializing_if = "Option::is_none")]
    pub show_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    #[serde(rename = "videoLabel")]
    pub video_label: String,
    #[serde(rename = "audioLabel")]
    pub audio_label: String,
    pub subtitle: String,
    // Mb/s, approximated from file size ÷ duration.
    pub bitrate: f64,
    // `direct` | `transcode`.
    pub mode: String,
    pub player: String,
    pub device: String,
    // `LAN` | `WAN`.
    pub network: String,
    pub ip: String,
    // `playing` | `paused`.
    pub state: String,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
    // Unix seconds, server clock.
    #[serde(rename = "startedAt")]
    pub started_at: i64,
    // Logged with the ended session, never shown on the live card.
    #[serde(skip)]
    pub library: String,
    #[serde(skip)]
    last_seen: Instant,
    // Time this session has actually spent playing, summed across the gaps
    // between beats. Not the wall clock: a paused player still beats, and an
    // abandoned one is reaped a TTL after its viewer left.
    #[serde(skip)]
    played_ms: i64,
}

/// What one heartbeat did to the live map.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Beat {
    Opened,
    Refreshed,
    Refused,
}

// Long enough that in-flight heartbeats can't re-register a terminated session.
const TERMINATE_GRACE: Duration = Duration::from_secs(60);

/// Shared, cheap-to-clone handle to the live-session map.
#[derive(Clone)]
pub struct Registry {
    inner: Arc<RwLock<HashMap<String, Session>>>,
    terminated: Arc<RwLock<HashMap<String, Instant>>>,
}

impl Registry {
    pub fn new() -> Self {
        Registry {
            inner: Arc::new(RwLock::new(HashMap::new())),
            terminated: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Drops the session and remembers the id, so its next heartbeat won't recreate it.
    pub fn terminate(&self, session_id: &str) -> Option<Session> {
        self.terminated
            .write()
            .unwrap()
            .insert(session_id.to_string(), Instant::now());
        self.inner.write().unwrap().remove(session_id)
    }

    /// Whether a ping for `session_id` should be refused rather than recreated.
    pub fn is_recently_terminated(&self, session_id: &str) -> bool {
        let mut map = self.terminated.write().unwrap();
        map.retain(|_, at| at.elapsed() < TERMINATE_GRACE);
        map.contains_key(session_id)
    }

    /// Opens the session on first sight, then refreshes it. The row belongs to
    /// the account that opened it: a beat from anyone else is [`Beat::Refused`]
    /// and writes nothing, under the one write lock the check shares with the
    /// write, so the viewer the dashboard names cannot be whoever beat last.
    ///
    /// `item` is only read on first sight, to build the title/streams snapshot
    /// of a catalogue item. A watch download is drawn from what its ping said.
    pub fn upsert(
        &self,
        ping: Ping,
        user_id: Option<String>,
        username: String,
        ip: String,
        network: String,
        item: Option<&MediaItem>,
    ) -> Beat {
        let now = Instant::now();
        let mut map = self.inner.write().unwrap();
        let live = map.get(&ping.session_id);
        if live.is_some_and(|s| s.user_id != user_id) {
            return Beat::Refused;
        }
        let is_new = live.is_none();
        let entry = map.entry(ping.session_id.clone()).or_insert_with(|| {
            let snap = ping.playing.snapshot(item);
            Session {
                id: ping.session_id.clone(),
                user_id: user_id.clone(),
                username: username.clone(),
                playing: ping.playing.clone(),
                title: snap.title,
                year: snap.year,
                kind: snap.kind,
                show_title: snap.show_title,
                season: snap.season,
                episode: snap.episode,
                video_label: snap.video_label,
                audio_label: snap.audio_label,
                subtitle: ping.subtitle.clone().unwrap_or_else(|| "Aucun".into()),
                bitrate: snap.bitrate,
                mode: ping.mode.clone(),
                player: ping.player.clone(),
                device: ping.device.clone(),
                network: network.clone(),
                ip: ip.clone(),
                state: ping.state.clone(),
                position_ms: ping.position_ms,
                duration_ms: ping.duration_ms,
                started_at: unix_now(),
                library: snap.library,
                last_seen: now,
                played_ms: 0,
            }
        });
        // The interval that just closed was spent in the state the PREVIOUS beat
        // reported, so this is folded in before the new one overwrites it. A gap
        // longer than the TTL is capped: past it the server had already given up
        // on the session, and counting the whole silence as viewing is a guess.
        if entry.state == PLAYING {
            let gap = now.duration_since(entry.last_seen).min(SESSION_TTL);
            entry.played_ms += gap.as_millis() as i64;
        }
        entry.position_ms = ping.position_ms;
        if ping.duration_ms.is_some() {
            entry.duration_ms = ping.duration_ms;
        }
        entry.state = ping.state;
        entry.mode = ping.mode;
        entry.network = network;
        entry.ip = ip;
        if let Some(a) = ping.audio {
            entry.audio_label = a;
        }
        if let Some(s) = ping.subtitle {
            entry.subtitle = s;
        }
        entry.last_seen = now;
        if is_new {
            Beat::Opened
        } else {
            Beat::Refreshed
        }
    }

    pub fn contains(&self, session_id: &str) -> bool {
        self.inner.read().unwrap().contains_key(session_id)
    }

    /// Unauthenticated by design - callers acting on a viewer's request must use
    /// [`Registry::remove_owned`] instead.
    pub fn remove(&self, session_id: &str) -> Option<Session> {
        self.inner.write().unwrap().remove(session_id)
    }

    /// Removes ONLY if `user_id` is the viewer watching it, so no account can end
    /// another's playback by naming their session id. Returns `None` both for an
    /// unknown id and for someone else's, so it cannot probe which sessions exist;
    /// one write lock covers lookup and removal, so racing stops cannot interleave.
    pub fn remove_owned(&self, session_id: &str, user_id: &str) -> Option<Session> {
        let mut sessions = self.inner.write().unwrap();
        let owned = sessions
            .get(session_id)
            .is_some_and(|s| s.user_id.as_deref() == Some(user_id));
        if owned {
            sessions.remove(session_id)
        } else {
            None
        }
    }

    /// Live (non-stale) sessions only, newest first.
    pub fn list(&self) -> Vec<Session> {
        let mut v: Vec<Session> = self
            .inner
            .read()
            .unwrap()
            .values()
            .filter(|s| s.last_seen.elapsed() < SESSION_TTL)
            .cloned()
            .collect();
        v.sort_by_key(|b| std::cmp::Reverse(b.started_at));
        v
    }

    pub fn user_online(&self, user_id: &str) -> bool {
        self.inner
            .read()
            .unwrap()
            .values()
            .any(|s| s.user_id.as_deref() == Some(user_id) && s.last_seen.elapsed() < SESSION_TTL)
    }

    fn drain_stale(&self) -> Vec<Session> {
        let mut map = self.inner.write().unwrap();
        let stale: Vec<String> = map
            .iter()
            .filter(|(_, s)| s.last_seen.elapsed() >= SESSION_TTL)
            .map(|(k, _)| k.clone())
            .collect();
        stale.into_iter().filter_map(|k| map.remove(&k)).collect()
    }

    /// Evicts stale sessions and logs each to history.
    pub fn spawn_reaper(&self, pool: Pool, events: Bus) {
        let reg = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(REAP_INTERVAL).await;
                let ended = reg.drain_stale();
                if ended.is_empty() {
                    continue;
                }
                for s in &ended {
                    record(&pool, s);
                }
                events.publish(ServerEvent::PlaybackStopped {
                    count: reg.list().len(),
                });
            }
        });
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
