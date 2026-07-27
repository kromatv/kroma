//! The receiver store: heartbeat upsert, the per-receiver command inbox with its
//! ack/replay bookkeeping, and the TTL reaper.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::infra::events::{Bus, ServerEvent};
use crate::model::{
    CastCommand, CastCommandEnvelope, CastNowPlaying, CastPlayback, CastReceiver, CastState,
    MediaItem,
};

/// A receiver that stops heartbeating for this long is gone (TV switched off,
/// app killed). Receivers beat every ~10 s, so this tolerates a few misses.
pub const RECEIVER_TTL: Duration = Duration::from_secs(45);
/// How often the reaper sweeps.
const REAP_INTERVAL: Duration = Duration::from_secs(15);
/// Hard cap on live receivers. A household has a handful; the cap is what stops
/// an authenticated client from growing the roster with invented ids.
const MAX_RECEIVERS: usize = 32;
/// Hard cap on undelivered commands per receiver. Beyond it the oldest is
/// dropped: a spamming sender costs bounded memory, and the freshest intent
/// (what the viewer just pressed) is the one that survives.
const MAX_INBOX: usize = 16;
/// Caps on the display strings a receiver names itself with. They are rendered
/// in *other people's* pickers, so they are length-bounded and control-stripped
/// here rather than trusted.
const MAX_NAME: usize = 48;
const MAX_PLATFORM: usize = 32;
/// Bounds on a relative skip, so a hostile `deltaMs` can't overflow the
/// receiver's clock arithmetic.
const MAX_SKIP_MS: i64 = 24 * 60 * 60 * 1000;

/// What a receiver sends on each heartbeat.
pub struct Announce {
    pub receiver_id: String,
    pub name: String,
    pub platform: String,
    /// Highest command seq the receiver has applied (0 = none yet).
    pub last_applied_seq: u64,
    /// What it is playing, or `None` when it sits on the home screen.
    pub playback: Option<CastPlayback>,
}

/// Result of [`Registry::announce`].
pub enum Announced {
    /// Accepted. `commands` are the ones still unacked (push may have been lost);
    /// `changed` means senders should refetch the roster.
    Ok {
        commands: Vec<CastCommandEnvelope>,
        changed: bool,
    },
    /// The id is registered to another account - refuse rather than take it over,
    /// so a receiver id cannot be claimed to intercept someone's commands.
    Taken,
    /// The roster is full (see [`MAX_RECEIVERS`]).
    Full,
}

struct Receiver {
    id: String,
    name: String,
    platform: String,
    /// The account that registered it. Ownership is sticky for the receiver's
    /// lifetime; it gates re-announce and unregister, never who may command it.
    user_id: String,
    username: String,
    /// `LAN` | `WAN`, from the playback classifier. Not the IP: the roster is
    /// readable by every viewer, so it carries no addressable detail.
    network: String,
    playback: Option<CastPlayback>,
    /// Catalog entry for `playback.item_id`, resolved server-side (the receiver
    /// only ever names an id) so senders render a title they cannot spoof.
    item: Option<MediaItem>,
    last_seen: Instant,
    inbox: VecDeque<CastCommandEnvelope>,
    next_seq: u64,
}

impl Receiver {
    fn live(&self) -> bool {
        self.last_seen.elapsed() < RECEIVER_TTL
    }

    /// The identity a sender sees: what's on screen, who it belongs to, nothing else.
    fn view(&self, viewer_id: &str) -> CastReceiver {
        let now_playing = match (self.item.as_ref(), self.playback.as_ref()) {
            (Some(item), Some(pb)) if pb.state != CastState::Idle => Some(CastNowPlaying {
                item: item.clone(),
                position_ms: pb.position_ms,
                duration_ms: pb.duration_ms.or_else(|| item.duration_ms.and_then(|d| i64::try_from(d).ok())),
                state: pb.state,
                audio: pb.audio.clone(),
                subtitle: pb.subtitle.clone(),
            }),
            _ => None,
        };
        CastReceiver {
            id: self.id.clone(),
            name: self.name.clone(),
            platform: self.platform.clone(),
            mine: self.user_id == viewer_id,
            username: self.username.clone(),
            network: self.network.clone(),
            now_playing,
        }
    }

    /// Whether a heartbeat moved anything senders draw beyond the scrub position
    /// (which rides the cheap `cast.position` event instead).
    fn differs(&self, next: Option<&CastPlayback>) -> bool {
        match (self.playback.as_ref(), next) {
            (None, None) => false,
            (Some(a), Some(b)) => a.item_id != b.item_id || a.state != b.state
                || a.audio != b.audio
                || a.subtitle != b.subtitle,
            _ => true,
        }
    }
}

/// Shared, cheap-to-clone handle to the receiver roster.
#[derive(Clone, Default)]
pub struct Registry {
    inner: Arc<RwLock<HashMap<String, Receiver>>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register or refresh a receiver. `item` is the resolved catalog entry for
    /// the announced item id - the caller looks it up only when
    /// [`Registry::wants_item`] says the stored one is stale.
    pub fn announce(
        &self,
        ann: Announce,
        user_id: &str,
        username: &str,
        network: String,
        item: Option<MediaItem>,
    ) -> Announced {
        let name = clean(&ann.name, MAX_NAME);
        let platform = clean(&ann.platform, MAX_PLATFORM);
        let mut map = self.inner.write().unwrap();
        map.retain(|_, r| r.live());

        let changed = match map.get(&ann.receiver_id) {
            Some(r) if r.user_id != user_id => return Announced::Taken,
            Some(r) => r.differs(ann.playback.as_ref()) || r.name != name,
            None if map.len() >= MAX_RECEIVERS => return Announced::Full,
            None => true,
        };

        let entry = map.entry(ann.receiver_id.clone()).or_insert_with(|| Receiver {
            id: ann.receiver_id.clone(),
            name: name.clone(),
            platform: platform.clone(),
            user_id: user_id.to_string(),
            username: username.to_string(),
            network: network.clone(),
            playback: None,
            item: None,
            last_seen: Instant::now(),
            inbox: VecDeque::new(),
            next_seq: 1,
        });
        entry.name = name;
        entry.platform = platform;
        entry.username = username.to_string();
        entry.network = network;
        if item.is_some() {
            entry.item = item;
        }
        // A receiver that stopped playing drops its item snapshot too, so the
        // roster never shows a stale title next to an idle TV.
        if ann.playback.is_none() {
            entry.item = None;
        }
        entry.playback = ann.playback;
        entry.last_seen = Instant::now();

        // Ack: everything the receiver says it applied leaves the inbox. What
        // remains is replayed - the WS push may never have landed.
        entry.inbox.retain(|c| c.seq > ann.last_applied_seq);
        let commands = entry.inbox.iter().cloned().collect();
        Announced::Ok { commands, changed }
    }

    /// Whether the caller must fetch `item_id` from the catalog before announcing
    /// (unknown receiver, or it moved to another title).
    pub fn wants_item(&self, receiver_id: &str, item_id: &str) -> bool {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .and_then(|r| r.item.as_ref())
            .is_none_or(|item| item.id != item_id)
    }

    /// Queue a command and hand back its seq. `None` when the receiver is gone -
    /// the caller answers 404 (and thereby also can't be used to probe the
    /// roster, which the sender is allowed to list anyway).
    pub fn enqueue(&self, receiver_id: &str, command: CastCommand) -> Option<CastCommandEnvelope> {
        let mut map = self.inner.write().unwrap();
        let entry = map.get_mut(receiver_id).filter(|r| r.live())?;
        let seq = entry.next_seq;
        entry.next_seq += 1;
        while entry.inbox.len() >= MAX_INBOX {
            entry.inbox.pop_front();
        }
        let envelope = CastCommandEnvelope {
            seq,
            command: clamp(command),
        };
        entry.inbox.push_back(envelope.clone());
        Some(envelope)
    }

    /// Every live receiver, the caller's own first, then by name.
    pub fn list(&self, viewer_id: &str) -> Vec<CastReceiver> {
        let mut v: Vec<CastReceiver> = self
            .inner
            .read()
            .unwrap()
            .values()
            .filter(|r| r.live())
            .map(|r| r.view(viewer_id))
            .collect();
        v.sort_by(|a, b| b.mine.cmp(&a.mine).then_with(|| a.name.cmp(&b.name)));
        v
    }

    /// Whether `user_id` registered this receiver. Gates unregistering and the
    /// event bus's targeted delivery.
    pub fn owns(&self, receiver_id: &str, user_id: &str) -> bool {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .is_some_and(|r| r.live() && r.user_id == user_id)
    }

    /// Drop a receiver on its own request (sign-out / app quit). Scoped to the
    /// owner, so one account cannot evict another's TV. Returns whether it went.
    pub fn remove_owned(&self, receiver_id: &str, user_id: &str) -> bool {
        let mut map = self.inner.write().unwrap();
        if map.get(receiver_id).is_some_and(|r| r.user_id == user_id) {
            map.remove(receiver_id).is_some()
        } else {
            false
        }
    }

    /// Drop expired receivers; true when something actually went (so the caller
    /// only announces a roster change when there is one).
    fn reap(&self) -> bool {
        let mut map = self.inner.write().unwrap();
        let before = map.len();
        map.retain(|_, r| r.live());
        map.len() != before
    }

    /// Sweep dead receivers out of the picker.
    pub fn spawn_reaper(&self, events: Bus) {
        let reg = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(REAP_INTERVAL).await;
                if reg.reap() {
                    events.publish(ServerEvent::CastReceivers);
                }
            }
        });
    }
}

/// Whether a receiver id is well-formed. Ids are client-generated (they must
/// survive a reinstall-free restart) but they are map keys echoed to other
/// clients, so the shape is fixed here rather than trusted.
pub fn valid_receiver_id(id: &str) -> bool {
    (8..=64).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Trim a client-supplied display string to something safe to render: no control
/// characters (which would let a name forge lines in a picker), bounded length.
fn clean(s: &str, max: usize) -> String {
    let out: String = s.chars().filter(|c| !c.is_control()).take(max).collect();
    out.trim().to_string()
}

/// Clamp the numeric fields of a command into a sane range before it is stored,
/// so a hostile sender can't hand the TV a position that overflows its clock.
fn clamp(command: CastCommand) -> CastCommand {
    match command {
        CastCommand::Play { item_id, position_ms } => CastCommand::Play {
            item_id,
            position_ms: position_ms.clamp(0, MAX_SKIP_MS),
        },
        CastCommand::Seek { position_ms } => CastCommand::Seek {
            position_ms: position_ms.clamp(0, MAX_SKIP_MS),
        },
        CastCommand::Skip { delta_ms } => CastCommand::Skip {
            delta_ms: delta_ms.clamp(-MAX_SKIP_MS, MAX_SKIP_MS),
        },
        other => other,
    }
}
