//! The receiver store: heartbeat upsert, the per-receiver command inbox with its
//! ack/replay bookkeeping, and the TTL reaper.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

// Names a device chose for itself are rendered in other people's pickers, where
// a raw control character could forge a line; `clean_label` is what strips them.
use kroma_primitives::clean_label as clean;

use crate::model::{
    CastCommandEnvelope, CastController, CastNowPlaying, CastPlayback, CastReceiver, CastState,
    MediaItem,
};

mod announce;
mod controllers;
mod inbox;
mod reaper;

#[cfg(test)]
mod test_support;

use controllers::ControllerEntry;

pub const RECEIVER_TTL: Duration = Duration::from_secs(45);
const REAP_INTERVAL: Duration = Duration::from_secs(15);
const MAX_RECEIVERS: usize = 32;
const MAX_INBOX: usize = 16;
const MAX_NAME: usize = 48;
const MAX_PLATFORM: usize = 32;
const MAX_TRACKS: usize = 64;
const MAX_TRACK_LABEL: usize = 64;
const MAX_CONTROLLERS: usize = 8;
const MAX_SKIP_MS: i64 = 24 * 60 * 60 * 1000;

pub struct Announce {
    pub receiver_id: String,
    pub name: String,
    pub platform: String,
    pub last_applied_seq: u64,
    pub playback: Option<CastPlayback>,
}

pub struct Hello {
    pub receiver_id: String,
    pub name: String,
    pub platform: String,
}

pub enum StateChange {
    Row(CastReceiver),
    Position {
        position_ms: i64,
        duration_ms: Option<i64>,
        state: CastState,
    },
    Nothing,
}

/// `Taken` refuses an id registered to another account, so a receiver id cannot
/// be claimed to intercept someone's commands.
pub enum Announced {
    Ok {
        commands: Vec<CastCommandEnvelope>,
        changed: bool,
    },
    Taken,
    Full,
}

struct Receiver {
    id: String,
    name: String,
    platform: String,
    // Sticky for the receiver's lifetime; scopes everything — who sees this set,
    // who may command it, who may re-announce or unregister it.
    user_id: String,
    username: String,
    // `LAN` | `WAN`, never the IP: the row still travels to every device of the
    // account.
    network: String,
    playback: Option<CastPlayback>,
    // Resolved server-side, so senders render a title they cannot spoof.
    item: Option<MediaItem>,
    last_seen: Instant,
    inbox: VecDeque<CastCommandEnvelope>,
    next_seq: u64,
    controllers: HashMap<String, ControllerEntry>,
    // Accounts this set sent away, refused until they pick it up again;
    // without it a client ignoring `cast.kicked` keeps commanding the TV.
    kicked: HashSet<String>,
}

impl Receiver {
    fn live(&self) -> bool {
        self.last_seen.elapsed() < RECEIVER_TTL
    }

    fn view(&self) -> CastReceiver {
        let now_playing = match (self.item.as_ref(), self.playback.as_ref()) {
            (Some(item), Some(pb)) if pb.state != CastState::Idle => Some(CastNowPlaying {
                item: item.clone(),
                position_ms: pb.position_ms,
                duration_ms: pb
                    .duration_ms
                    .or_else(|| item.duration_ms.and_then(|d| i64::try_from(d).ok())),
                state: pb.state,
                audio_tracks: pb.audio_tracks.clone(),
                audio_index: pb.audio_index,
                subtitles: pb.subtitles.clone(),
                subtitle_index: pb.subtitle_index,
            }),
            _ => None,
        };
        CastReceiver {
            id: self.id.clone(),
            name: self.name.clone(),
            platform: self.platform.clone(),
            username: self.username.clone(),
            network: self.network.clone(),
            now_playing,
            controllers: {
                let mut list: Vec<CastController> =
                    self.controllers.values().map(|c| c.view.clone()).collect();
                // Stable order, so the list does not reshuffle on every pause.
                list.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
                list
            },
        }
    }

    fn differs(&self, next: Option<&CastPlayback>) -> bool {
        match (self.playback.as_ref(), next) {
            (None, None) => false,
            (Some(a), Some(b)) => {
                a.item_id != b.item_id
                    || a.state != b.state
                    || a.audio_index != b.audio_index
                    || a.subtitle_index != b.subtitle_index
                    || a.audio_tracks != b.audio_tracks
                    || a.subtitles != b.subtitles
            }
            _ => true,
        }
    }
}

#[derive(Clone, Default)]
pub struct Registry {
    inner: Arc<RwLock<HashMap<String, Receiver>>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// The live receivers signed into `user_id`'s account — the only ones that
    /// account may see or drive. Another household's TV never appears here.
    pub fn list(&self, user_id: &str) -> Vec<CastReceiver> {
        let mut v: Vec<CastReceiver> = self
            .inner
            .read()
            .unwrap()
            .values()
            .filter(|r| r.live() && r.user_id == user_id)
            .map(Receiver::view)
            .collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub fn row(&self, receiver_id: &str) -> Option<CastReceiver> {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .filter(|r| r.live())
            .map(Receiver::view)
    }

    /// The account a live receiver is signed into. Commands are addressed to it on
    /// the event bus, so a TV's orders reach that account's sockets and no others.
    pub fn owner_of(&self, receiver_id: &str) -> Option<String> {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .filter(|r| r.live())
            .map(|r| r.user_id.clone())
    }

    /// Scoped to the owner, so one account cannot evict another's TV.
    pub fn remove_owned(&self, receiver_id: &str, user_id: &str) -> bool {
        let mut map = self.inner.write().unwrap();
        if map.get(receiver_id).is_some_and(|r| r.user_id == user_id) {
            map.remove(receiver_id).is_some()
        } else {
            false
        }
    }
}

/// Whether a receiver id is well-formed. Ids are client-generated but are map
/// keys echoed to other clients, so the shape is fixed here rather than trusted.
pub fn valid_receiver_id(id: &str) -> bool {
    kroma_primitives::valid_device_id(id)
}

fn trim_tracks(mut pb: CastPlayback) -> CastPlayback {
    for list in [&mut pb.audio_tracks, &mut pb.subtitles] {
        list.truncate(MAX_TRACKS);
        for track in list.iter_mut() {
            track.label = clean(&track.label, MAX_TRACK_LABEL);
        }
    }
    pb
}

#[cfg(test)]
mod tests {
    use super::*;
    use test_support::{announce_ok, beat};

    #[test]
    fn only_the_owner_can_unregister() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert!(!reg.remove_owned("tv-salon-01", "u2"));
        assert_eq!(reg.list("u1").len(), 1);
        assert!(reg.remove_owned("tv-salon-01", "u1"));
        assert!(reg.list("u1").is_empty());
        assert!(!reg.remove_owned("tv-salon-01", "u1"));
    }

    #[test]
    fn receiver_ids_have_a_fixed_shape() {
        assert!(valid_receiver_id("tv-salon-01"));
        assert!(valid_receiver_id(&"a".repeat(64)));
        assert!(!valid_receiver_id("short"));
        assert!(!valid_receiver_id(&"a".repeat(65)));
        assert!(!valid_receiver_id("../../etc/passwd"));
        assert!(!valid_receiver_id("tv salon 01"));
        assert!(!valid_receiver_id("télé-salon"));
    }
}
