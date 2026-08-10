//! The live-session store: the heartbeat map, its upsert/list/reap lifecycle, and
//! appending ended sessions to the play-history log.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::db::Pool;
use crate::infra::events::{Bus, ServerEvent};
use crate::model::MediaItem;

use super::snapshot::snapshot;

// Clients heartbeat every ~10s, so this tolerates a couple of missed beats.
const SESSION_TTL: Duration = Duration::from_secs(30);
const REAP_INTERVAL: Duration = Duration::from_secs(10);

pub struct Ping {
    pub session_id: String,
    pub item_id: String,
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
    #[serde(rename = "itemId")]
    pub item_id: String,
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
    #[serde(skip)]
    last_seen: Instant,
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

    /// `item` is only read on first sight, to build the title/streams snapshot.
    pub fn upsert(
        &self,
        ping: Ping,
        user_id: Option<String>,
        username: String,
        ip: String,
        network: String,
        item: Option<&MediaItem>,
    ) -> bool {
        let now = Instant::now();
        let mut map = self.inner.write().unwrap();
        let is_new = !map.contains_key(&ping.session_id);
        let entry = map.entry(ping.session_id.clone()).or_insert_with(|| {
            let snap = item.map(snapshot).unwrap_or_default();
            Session {
                id: ping.session_id.clone(),
                user_id: user_id.clone(),
                username: username.clone(),
                item_id: ping.item_id.clone(),
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
                last_seen: now,
            }
        });
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
        is_new
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
        if owned { sessions.remove(session_id) } else { None }
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

/// Append one ended session to the play-history log; best-effort.
pub fn record(pool: &Pool, s: &Session) {
    let ended = unix_now();
    let watched = ((ended - s.started_at).max(0)) * 1000;
    let _ = crate::db::record_play(
        pool,
        s.user_id.as_deref(),
        Some(&s.username),
        Some(&s.item_id),
        &s.kind,
        &s.title,
        None,
        s.started_at,
        ended,
        watched,
    );
}

fn unix_now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::TempPool;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("playback-reg")
    }

    fn ping(session_id: &str, pos: i64, state: &str) -> Ping {
        Ping {
            session_id: session_id.into(),
            item_id: "item1".into(),
            position_ms: pos,
            duration_ms: Some(100_000),
            state: state.into(),
            mode: "direct".into(),
            player: "web".into(),
            device: "Chrome".into(),
            audio: None,
            subtitle: None,
        }
    }

    #[test]
    fn upsert_creates_then_refreshes() {
        let reg = Registry::default();
        assert!(reg.upsert(ping("s1", 1000, "playing"), Some("u1".into()), "Alice".into(), "1.2.3.4".into(), "WAN".into(), None));
        assert!(!reg.upsert(ping("s1", 5000, "paused"), Some("u1".into()), "Alice".into(), "1.2.3.4".into(), "LAN".into(), None));
        let list = reg.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].position_ms, 5000);
        assert_eq!(list[0].state, "paused");
        assert_eq!(list[0].network, "LAN");
        assert!(reg.contains("s1"));
        assert!(!reg.contains("nope"));
    }

    #[test]
    fn upsert_updates_audio_and_subtitle_labels() {
        let reg = Registry::new();
        reg.upsert(ping("s1", 0, "playing"), None, "Anon".into(), "ip".into(), "LAN".into(), None);
        let mut p = ping("s1", 10, "playing");
        p.audio = Some("English 5.1".into());
        p.subtitle = Some("French".into());
        reg.upsert(p, None, "Anon".into(), "ip".into(), "LAN".into(), None);
        let s = &reg.list()[0];
        assert_eq!(s.audio_label, "English 5.1");
        assert_eq!(s.subtitle, "French");
    }

    #[test]
    fn remove_returns_session() {
        let reg = Registry::new();
        reg.upsert(ping("s1", 0, "playing"), None, "u".into(), "ip".into(), "LAN".into(), None);
        let removed = reg.remove("s1");
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().id, "s1");
        assert!(reg.remove("s1").is_none());
        assert!(reg.list().is_empty());
    }

    #[test]
    fn terminate_removes_and_blocks_regrace() {
        let reg = Registry::new();
        reg.upsert(ping("s1", 0, "playing"), None, "u".into(), "ip".into(), "LAN".into(), None);
        let ended = reg.terminate("s1");
        assert!(ended.is_some());
        assert!(reg.is_recently_terminated("s1"));
        assert!(!reg.is_recently_terminated("other"));
        assert!(reg.terminate("ghost").is_none());
        assert!(reg.is_recently_terminated("ghost"));
    }

    #[test]
    fn user_online_reflects_live_sessions() {
        let reg = Registry::new();
        assert!(!reg.user_online("u1"));
        reg.upsert(ping("s1", 0, "playing"), Some("u1".into()), "u".into(), "ip".into(), "LAN".into(), None);
        assert!(reg.user_online("u1"));
        assert!(!reg.user_online("u2"));
    }

    #[test]
    fn list_sorts_newest_started_first() {
        let reg = Registry::new();
        reg.upsert(ping("old", 0, "playing"), None, "u".into(), "ip".into(), "LAN".into(), None);
        reg.upsert(ping("new", 0, "playing"), None, "u".into(), "ip".into(), "LAN".into(), None);
        // Same-second inserts would tie.
        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("old").unwrap().started_at = 100;
            map.get_mut("new").unwrap().started_at = 200;
        }
        let list = reg.list();
        assert_eq!(list[0].id, "new");
        assert_eq!(list[1].id, "old");
    }

    #[test]
    fn stale_sessions_are_filtered_and_drained() {
        let reg = Registry::new();
        reg.upsert(ping("live", 0, "playing"), None, "u".into(), "ip".into(), "LAN".into(), None);
        reg.upsert(ping("dead", 0, "playing"), Some("u9".into()), "u".into(), "ip".into(), "LAN".into(), None);
        // Age out "dead" past the TTL.
        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("dead").unwrap().last_seen = Instant::now() - Duration::from_secs(120);
        }
        assert_eq!(reg.list().len(), 1);
        assert!(!reg.user_online("u9"));
        let drained = reg.drain_stale();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].id, "dead");
        assert!(reg.contains("live"));
        assert!(!reg.contains("dead"));
    }

    #[test]
    fn record_appends_to_play_history() {
        let pool = test_pool();
        let reg = Registry::new();
        reg.upsert(ping("s1", 0, "playing"), Some("u1".into()), "Alice".into(), "ip".into(), "LAN".into(), None);
        let session = reg.remove("s1").unwrap();
        record(&pool, &session);
        let count: i64 = pool
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM play_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn unix_now_is_positive() {
        assert!(unix_now() > 1_600_000_000);
    }
}
