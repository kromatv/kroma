//! The receiver store: heartbeat upsert, the per-receiver command inbox with its
//! ack/replay bookkeeping, and the TTL reaper.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::infra::events::{Bus, ServerEvent};
use crate::model::{
    CastCommand, CastCommandEnvelope, CastController, CastNowPlaying, CastPlayback, CastReceiver,
    CastState, MediaItem,
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
/// Same treatment for the track lists a receiver advertises: they are rendered
/// in a remote's pickers, so both their length and their labels are bounded.
const MAX_TRACKS: usize = 64;
const MAX_TRACK_LABEL: usize = 64;
/// Hard cap on remotes driving one set. A living room has a few; the cap is what
/// keeps a client from filling a television's status bar.
const MAX_CONTROLLERS: usize = 8;
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

/// What a receiver says when it attaches over its event socket.
pub struct Hello {
    pub receiver_id: String,
    pub name: String,
    pub platform: String,
}

/// How senders should hear about a state update (see [`Registry::set_state`]).
pub enum StateChange {
    /// Something a picker draws changed: broadcast the whole row.
    Row(CastReceiver),
    /// Only the scrub position moved: broadcast the tiny frame.
    Position {
        position_ms: i64,
        duration_ms: Option<i64>,
        state: CastState,
    },
    /// Nothing worth a frame (an idle TV repeating itself).
    Nothing,
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

/// A controller as the registry holds it: what a television shows, plus the
/// account it belongs to (kept OFF the wire type - the roster is readable by
/// every viewer and carries no internal identifiers).
struct ControllerEntry {
    view: CastController,
    user_id: String,
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
    /// The senders driving this set, keyed by their socket-scoped id.
    controllers: HashMap<String, ControllerEntry>,
    /// Accounts this set has sent away, and which may not command it again until
    /// they deliberately pick it up.
    ///
    /// `kick` used to be courtesy: it removed the roster entry and told the
    /// remote to stand down, but nothing enforced it. A client that ignored the
    /// message - a build predating it, or a second instance - kept pausing and
    /// seeking the television, and was no longer LISTED, so it could not even be
    /// kicked again. Refusing by account is what makes the button mean something.
    kicked: HashSet<String>,
}

impl Receiver {
    fn live(&self) -> bool {
        self.last_seen.elapsed() < RECEIVER_TTL
    }

    /// The identity a sender sees: what's on screen, whose profile, nothing else.
    /// Viewer-independent on purpose - that is what lets one row be broadcast to
    /// every sender instead of each of them refetching the roster.
    fn view(&self) -> CastReceiver {
        let now_playing = match (self.item.as_ref(), self.playback.as_ref()) {
            (Some(item), Some(pb)) if pb.state != CastState::Idle => Some(CastNowPlaying {
                item: item.clone(),
                position_ms: pb.position_ms,
                duration_ms: pb.duration_ms.or_else(|| item.duration_ms.and_then(|d| i64::try_from(d).ok())),
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
                // Stable order, so a television's list does not reshuffle itself
                // every time somebody presses pause.
                list.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
                list
            },
        }
    }

    /// Whether a heartbeat moved anything senders draw beyond the scrub position
    /// (which rides the cheap `cast.position` event instead).
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
            controllers: HashMap::new(),
            kicked: HashSet::new(),
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
        entry.playback = ann.playback.map(trim_tracks);
        entry.last_seen = Instant::now();

        // Ack: everything the receiver says it applied leaves the inbox. What
        // remains is replayed - the WS push may never have landed.
        entry.inbox.retain(|c| c.seq > ann.last_applied_seq);
        let commands = entry.inbox.iter().cloned().collect();
        Announced::Ok { commands, changed }
    }

    /// Register a receiver whose presence is its **socket**, not a heartbeat.
    ///
    /// The live path: the TV says hello once on its event socket and then only
    /// speaks when something changes. Liveness comes from the connection itself
    /// (the pump touches it on each keepalive tick, and drops it outright when
    /// the socket closes), so a set that is switched off leaves every picker at
    /// once instead of aging out of a TTL.
    pub fn attach(&self, hello: Hello, user_id: &str, username: &str, network: String) -> Announced {
        self.announce(
            Announce {
                receiver_id: hello.receiver_id,
                name: hello.name,
                platform: hello.platform,
                // A reconnecting socket re-sends everything it has not applied;
                // its own `cast.ack` frames are what clear the inbox.
                last_applied_seq: 0,
                playback: None,
            },
            user_id,
            username,
            network,
            None,
        )
    }

    /// Update what a socket-attached receiver is playing. Returns how senders
    /// should hear about it, or `None` when the receiver is gone.
    pub fn set_state(
        &self,
        receiver_id: &str,
        playback: Option<CastPlayback>,
        item: Option<MediaItem>,
    ) -> Option<StateChange> {
        let mut map = self.inner.write().unwrap();
        let entry = map.get_mut(receiver_id)?;
        let material = entry.differs(playback.as_ref());
        if item.is_some() {
            entry.item = item;
        }
        if playback.is_none() {
            entry.item = None;
        }
        entry.playback = playback.map(trim_tracks);
        entry.last_seen = Instant::now();
        // A position that merely advanced rides the small `cast.position` frame;
        // anything a picker draws (title, transport, tracks) sends the whole row.
        Some(if material {
            StateChange::Row(entry.view())
        } else {
            match entry.playback.as_ref() {
                Some(pb) => StateChange::Position {
                    position_ms: pb.position_ms,
                    duration_ms: pb.duration_ms,
                    state: pb.state,
                },
                None => StateChange::Nothing,
            }
        })
    }

    /// A sender starts driving a receiver. `controller_id` is minted by the
    /// caller per SOCKET (never by the client), so the identity a television
    /// shows cannot be forged by another sender.
    ///
    /// Returns the receiver's new row when it changed, so the caller can put it
    /// on the bus - that is how the TV learns who just picked up its remote.
    pub fn attach_controller(
        &self,
        receiver_id: &str,
        controller_id: &str,
        name: &str,
        user_id: &str,
        username: &str,
        avatar_url: Option<&str>,
    ) -> Option<CastReceiver> {
        let mut map = self.inner.write().unwrap();
        let entry = map.get_mut(receiver_id).filter(|r| r.live())?;
        // Picking a set up again is a deliberate act by the person holding the
        // phone, so it clears an earlier kick. The block is there to stop a
        // client that ignored `cast.kicked` from carrying on, not to ban anyone.
        entry.kicked.remove(user_id);
        let view = CastController {
            id: controller_id.to_string(),
            name: clean(name, MAX_NAME),
            username: username.to_string(),
            avatar_url: avatar_url.map(|u| clean(u, MAX_NAME)),
        };
        // One entry per device, not per socket. A controller id belongs to a
        // SOCKET, and a phone that reconnects - a flaky network, an app resumed,
        // a dev reload - arrives on a new one while the server has not yet
        // noticed the old socket die. Without this the television lists the same
        // phone twice, under two names it cannot tell apart, and disconnecting
        // one leaves the ghost.
        let superseded: Vec<String> = entry
            .controllers
            .iter()
            .filter(|(id, c)| {
                id.as_str() != controller_id && c.user_id == user_id && c.view.name == view.name
            })
            .map(|(id, _)| id.clone())
            .collect();
        let replaced = !superseded.is_empty();
        for id in superseded {
            entry.controllers.remove(&id);
        }
        if entry.controllers.len() >= MAX_CONTROLLERS
            && !entry.controllers.contains_key(controller_id)
        {
            return None;
        }
        // Unchanged and nothing was dropped: not worth a frame. (A supersede IS
        // a change, even when this controller's own row reads the same.)
        if !replaced && entry.controllers.get(controller_id).map(|c| &c.view) == Some(&view) {
            return None;
        }
        entry
            .controllers
            .insert(controller_id.to_string(), ControllerEntry { view, user_id: user_id.to_string() });
        Some(entry.view())
    }

    /// A sender stops driving (deselected it, closed its socket, or was
    /// disconnected by the television). Returns the rows that changed.
    pub fn detach_controller(&self, controller_id: &str) -> Vec<CastReceiver> {
        let mut map = self.inner.write().unwrap();
        let mut changed = Vec::new();
        for receiver in map.values_mut() {
            if receiver.controllers.remove(controller_id).is_some() {
                changed.push(receiver.view());
            }
        }
        changed
    }

    /// A television sends one of ITS OWN remotes away.
    ///
    /// Scoped to `receiver_id` on purpose, and in one lock: the roster is
    /// readable by every viewer and carries controller ids, so a caller that
    /// removed by controller id alone would let any set evict a remote driving
    /// somebody else's. Returns the set's new row and the account to notify, or
    /// `None` when that controller is not on this set.
    pub fn kick_controller(
        &self,
        receiver_id: &str,
        controller_id: &str,
    ) -> Option<(CastReceiver, String)> {
        let mut map = self.inner.write().unwrap();
        let entry = map.get_mut(receiver_id)?;
        let gone = entry.controllers.remove(controller_id)?;
        entry.kicked.insert(gone.user_id.clone());
        Some((entry.view(), gone.user_id))
    }

    /// Whether `user_id` may send this set an order.
    ///
    /// `None` when there is no such live receiver - the caller answers 404 for
    /// that, exactly as [`Self::enqueue`] does, so this cannot be used to probe
    /// the roster either.
    pub fn may_command(&self, receiver_id: &str, user_id: &str) -> Option<bool> {
        let map = self.inner.read().unwrap();
        let entry = map.get(receiver_id).filter(|r| r.live())?;
        Some(!entry.kicked.contains(user_id))
    }

    /// Drop everything the receiver has applied, by sequence number.
    pub fn ack(&self, receiver_id: &str, seq: u64) {
        let mut map = self.inner.write().unwrap();
        if let Some(entry) = map.get_mut(receiver_id) {
            entry.inbox.retain(|c| c.seq > seq);
            entry.last_seen = Instant::now();
        }
    }

    /// Keep a socket-attached receiver alive (called on the socket's keepalive
    /// tick, so a paused film does not age out of the roster).
    pub fn touch(&self, receiver_id: &str) {
        let mut map = self.inner.write().unwrap();
        if let Some(entry) = map.get_mut(receiver_id) {
            entry.last_seen = Instant::now();
        }
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

    /// Every live receiver, by name.
    pub fn list(&self) -> Vec<CastReceiver> {
        let mut v: Vec<CastReceiver> = self
            .inner
            .read()
            .unwrap()
            .values()
            .filter(|r| r.live())
            .map(Receiver::view)
            .collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    /// One receiver's row, for the bus (`None` once it is gone).
    pub fn row(&self, receiver_id: &str) -> Option<CastReceiver> {
        self.inner.read().unwrap().get(receiver_id).filter(|r| r.live()).map(Receiver::view)
    }

    /// The account a live receiver is signed into. Commands are addressed to it
    /// on the event bus, so a TV's orders reach that account's sockets and no
    /// others. `None` once the receiver is gone.
    pub fn owner_of(&self, receiver_id: &str) -> Option<String> {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .filter(|r| r.live())
            .map(|r| r.user_id.clone())
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

    /// Drop expired receivers, returning their ids so each departure can be
    /// announced by name (senders remove exactly that row).
    fn reap(&self) -> Vec<String> {
        let mut map = self.inner.write().unwrap();
        let gone: Vec<String> =
            map.iter().filter(|(_, r)| !r.live()).map(|(id, _)| id.clone()).collect();
        for id in &gone {
            map.remove(id);
        }
        gone
    }

    /// Sweep dead receivers out of the picker. This is now the BACKSTOP: a TV on
    /// the socket path is dropped the moment its connection closes, and only one
    /// that heartbeats over HTTP (or whose socket died without a close frame)
    /// waits out the TTL here.
    pub fn spawn_reaper(&self, events: Bus) {
        let reg = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(REAP_INTERVAL).await;
                for receiver_id in reg.reap() {
                    events.publish(ServerEvent::CastReceiverGone { receiver_id });
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

/// Bound the advertised track lists the same way as the display name: they are
/// drawn in other people's remotes, so neither their length nor their labels are
/// taken on trust.
fn trim_tracks(mut pb: CastPlayback) -> CastPlayback {
    for list in [&mut pb.audio_tracks, &mut pb.subtitles] {
        list.truncate(MAX_TRACKS);
        for track in list.iter_mut() {
            track.label = clean(&track.label, MAX_TRACK_LABEL);
        }
    }
    pb
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CastTrack, Kind};

    fn item(id: &str) -> MediaItem {
        MediaItem {
            id: id.into(),
            title: "The Film".into(),
            kind: Kind::Movie,
            year: Some(2020),
            duration_ms: Some(7_200_000),
            container: "mkv".into(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: "t".into(),
            metadata: None,
            abs_path: None,
            files: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    fn playing(item_id: &str, position_ms: i64) -> CastPlayback {
        CastPlayback {
            item_id: item_id.into(),
            position_ms,
            duration_ms: Some(7_200_000),
            state: CastState::Playing,
            audio_tracks: vec![CastTrack { index: 0, label: "English 5.1".into() }],
            audio_index: Some(0),
            subtitles: Vec::new(),
            subtitle_index: None,
        }
    }

    fn beat(id: &str, seq: u64, playback: Option<CastPlayback>) -> Announce {
        Announce {
            receiver_id: id.into(),
            name: "Salon".into(),
            platform: "Apple TV".into(),
            last_applied_seq: seq,
            playback,
        }
    }

    fn announce_ok(reg: &Registry, ann: Announce, user: &str, item: Option<MediaItem>) -> Vec<CastCommandEnvelope> {
        match reg.announce(ann, user, "Alice", "LAN".into(), item) {
            Announced::Ok { commands, .. } => commands,
            _ => panic!("expected the announce to be accepted"),
        }
    }

    #[test]
    fn a_receiver_appears_with_what_it_is_playing() {
        let reg = Registry::new();
        // First beat: the caller was told to resolve the item, and does.
        assert!(reg.wants_item("tv-salon-01", "it1"));
        announce_ok(&reg, beat("tv-salon-01", 0, Some(playing("it1", 1000))), "u1", Some(item("it1")));
        // Second beat on the same title needs no lookup.
        assert!(!reg.wants_item("tv-salon-01", "it1"));
        assert!(reg.wants_item("tv-salon-01", "it2"));

        let list = reg.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Salon");
        let np = list[0].now_playing.as_ref().expect("now playing");
        assert_eq!(np.item.id, "it1");
        assert_eq!(np.position_ms, 1000);
        // The row is viewer-independent, which is what lets the bus carry it.
        assert_eq!(reg.row("tv-salon-01").map(|r| r.name), Some("Salon".to_string()));
    }

    #[test]
    fn going_idle_clears_the_title() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, Some(playing("it1", 10))), "u1", Some(item("it1")));
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert!(reg.list()[0].now_playing.is_none());
        // ...and the next title is fetched afresh rather than reusing the old one.
        assert!(reg.wants_item("tv-salon-01", "it1"));
    }

    #[test]
    fn another_account_cannot_claim_a_registered_receiver() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        // The whole point: an id is bound to its account, so a second account
        // can't answer to it and collect the commands meant for the real TV.
        assert!(matches!(
            reg.announce(beat("tv-salon-01", 0, None), "u2", "Bob", "LAN".into(), None),
            Announced::Taken
        ));
        assert_eq!(reg.owner_of("tv-salon-01").as_deref(), Some("u1"));
    }

    #[test]
    fn the_roster_is_bounded() {
        let reg = Registry::new();
        for n in 0..MAX_RECEIVERS {
            announce_ok(&reg, beat(&format!("tv-{n:04}-xxxx"), 0, None), "u1", None);
        }
        assert!(matches!(
            reg.announce(beat("tv-9999-xxxx", 0, None), "u1", "Alice", "LAN".into(), None),
            Announced::Full
        ));
        // A full roster refuses the newcomer rather than evicting a live TV -
        // otherwise a flood of invented ids would push the real one out.
        assert_eq!(reg.list().len(), MAX_RECEIVERS);
    }

    #[test]
    fn commands_replay_until_they_are_acked() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        let first = reg.enqueue("tv-salon-01", CastCommand::Pause).expect("queued");
        let second = reg
            .enqueue("tv-salon-01", CastCommand::Seek { position_ms: 5000 })
            .expect("queued");
        assert_eq!((first.seq, second.seq), (1, 2));

        // Nothing acked yet → both come back (the push may never have landed).
        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), 2);
        // Acking the first leaves only the second.
        let pending = announce_ok(&reg, beat("tv-salon-01", 1, None), "u1", None);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].seq, 2);
        // Acking both empties the inbox, and seqs keep climbing.
        assert!(announce_ok(&reg, beat("tv-salon-01", 2, None), "u1", None).is_empty());
        assert_eq!(reg.enqueue("tv-salon-01", CastCommand::Stop).unwrap().seq, 3);
    }

    #[test]
    fn the_inbox_is_bounded_and_keeps_the_freshest() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        for _ in 0..(MAX_INBOX + 5) {
            reg.enqueue("tv-salon-01", CastCommand::Pause);
        }
        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), MAX_INBOX);
        // The survivors are the LAST ones queued: what the viewer just pressed.
        assert_eq!(pending.last().unwrap().seq, (MAX_INBOX + 5) as u64);
    }

    #[test]
    fn commands_for_an_unknown_or_dead_receiver_are_refused() {
        let reg = Registry::new();
        assert!(reg.enqueue("tv-ghost-01", CastCommand::Pause).is_none());
        assert!(reg.owner_of("tv-ghost-01").is_none());

        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(120);
        }
        assert!(reg.enqueue("tv-salon-01", CastCommand::Pause).is_none());
        assert!(reg.list().is_empty());
        assert_eq!(reg.reap(), vec!["tv-salon-01".to_string()]);
        assert!(reg.reap().is_empty()); // nothing left to sweep
    }

    #[test]
    fn only_the_owner_can_unregister() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert!(!reg.remove_owned("tv-salon-01", "u2"));
        assert_eq!(reg.list().len(), 1);
        assert!(reg.remove_owned("tv-salon-01", "u1"));
        assert!(reg.list().is_empty());
        // Removing what isn't there is a no-op, not an error.
        assert!(!reg.remove_owned("tv-salon-01", "u1"));
    }

    #[test]
    fn roster_changes_are_announced_but_a_scrub_is_not() {
        let reg = Registry::new();
        let changed = |a: Announce, item: Option<MediaItem>| match reg.announce(a, "u1", "Alice", "LAN".into(), item) {
            Announced::Ok { changed, .. } => changed,
            _ => panic!("accepted"),
        };
        assert!(changed(beat("tv-salon-01", 0, Some(playing("it1", 0))), Some(item("it1"))));
        // Position alone moving is NOT a roster change: it rides cast.position.
        assert!(!changed(beat("tv-salon-01", 0, Some(playing("it1", 30_000))), None));
        // A new title, a pause, or a new name is.
        assert!(changed(beat("tv-salon-01", 0, Some(playing("it2", 0))), Some(item("it2"))));
        let mut paused = playing("it2", 100);
        paused.state = CastState::Paused;
        assert!(changed(beat("tv-salon-01", 0, Some(paused)), None));
    }

    #[test]
    fn display_strings_are_capped_and_stripped() {
        let reg = Registry::new();
        let mut ann = beat("tv-salon-01", 0, None);
        ann.name = format!("  Sa\u{7}lon{}  ", "x".repeat(200));
        ann.platform = "tv\nOS".into();
        announce_ok(&reg, ann, "u1", None);
        let row = &reg.list()[0];
        assert!(!row.name.contains('\u{7}'), "control chars are stripped: {:?}", row.name);
        assert!(row.name.len() <= MAX_NAME);
        assert_eq!(row.platform, "tvOS");
    }

    #[test]
    fn receiver_ids_have_a_fixed_shape() {
        assert!(valid_receiver_id("tv-salon-01"));
        assert!(valid_receiver_id(&"a".repeat(64)));
        assert!(!valid_receiver_id("short"));
        assert!(!valid_receiver_id(&"a".repeat(65)));
        // No path separators, spaces or unicode: the id is a map key that is
        // echoed back to other clients.
        assert!(!valid_receiver_id("../../etc/passwd"));
        assert!(!valid_receiver_id("tv salon 01"));
        assert!(!valid_receiver_id("télé-salon"));
    }

    // ----- the socket path: presence is the connection ------------------------

    #[test]
    fn a_socket_attaches_a_receiver_and_reports_only_what_changed() {
        let reg = Registry::new();
        let hello = || Hello {
            receiver_id: "tv-salon-01".into(),
            name: "Salon".into(),
            platform: "Apple TV".into(),
        };
        assert!(matches!(
            reg.attach(hello(), "u1", "Alice", "LAN".into()),
            Announced::Ok { .. }
        ));
        assert_eq!(reg.list().len(), 1);

        // First title: a picker has to redraw, so the whole row goes out.
        let change = reg.set_state("tv-salon-01", Some(playing("it1", 0)), Some(item("it1")));
        assert!(matches!(change, Some(StateChange::Row(_))));

        // The position merely advancing is the tiny frame - this is the whole
        // point of the split: a playing film sends no rows at all.
        let change = reg.set_state("tv-salon-01", Some(playing("it1", 30_000)), None);
        match change {
            Some(StateChange::Position { position_ms, state, .. }) => {
                assert_eq!(position_ms, 30_000);
                assert_eq!(state, CastState::Playing);
            }
            _ => panic!("a position-only update must not broadcast a row"),
        }

        // A pause is a row again: it changes what the remote draws.
        let mut paused = playing("it1", 30_000);
        paused.state = CastState::Paused;
        assert!(matches!(
            reg.set_state("tv-salon-01", Some(paused), None),
            Some(StateChange::Row(_))
        ));

        // Leaving the player clears the title.
        assert!(matches!(
            reg.set_state("tv-salon-01", None, None),
            Some(StateChange::Row(_))
        ));
        assert!(reg.list()[0].now_playing.is_none());

        // An idle TV repeating itself is worth no frame at all.
        assert!(matches!(reg.set_state("tv-salon-01", None, None), Some(StateChange::Nothing)));
        // ...and a state update for a receiver that is gone is simply nothing.
        assert!(reg.set_state("tv-ghost-01", None, None).is_none());
    }

    #[test]
    fn a_socket_acks_by_sequence_and_keeps_itself_alive() {
        let reg = Registry::new();
        reg.attach(
            Hello { receiver_id: "tv-salon-01".into(), name: "Salon".into(), platform: "tvOS".into() },
            "u1",
            "Alice",
            "LAN".into(),
        );
        reg.enqueue("tv-salon-01", CastCommand::Pause);
        reg.enqueue("tv-salon-01", CastCommand::Stop);
        reg.ack("tv-salon-01", 1);
        // Only the unacked one is left to replay if the socket ever drops.
        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].seq, 2);

        // A paused film sends nothing for minutes; the socket's keepalive tick is
        // what stops the TTL from reaping a set that is very much still there.
        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(40);
        }
        reg.touch("tv-salon-01");
        assert!(reg.reap().is_empty());
        assert_eq!(reg.list().len(), 1);
    }

    #[test]
    fn a_kicked_remote_stops_being_obeyed_until_it_picks_the_set_up_again() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-b", "iPad", "u2", "bob", None).expect("attached");

        // Driving it is fine until the set says otherwise.
        assert_eq!(reg.may_command("tv-salon-01", "u2"), Some(true));
        reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");

        // The point of the button: a client that ignores `cast.kicked` and keeps
        // POSTing is refused, rather than carrying on unlisted and unkickable.
        assert_eq!(reg.may_command("tv-salon-01", "u2"), Some(false));
        // ...and only for the account that was sent away.
        assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));

        // Picking the set up again is a deliberate act, so it is allowed.
        reg.attach_controller("tv-salon-01", "sock-c", "iPad", "u2", "bob", None).expect("attached");
        assert_eq!(reg.may_command("tv-salon-01", "u2"), Some(true));

        // A set nobody has heard of is not a 403 - the caller answers 404, and
        // this cannot be used to find out which ids exist.
        assert_eq!(reg.may_command("tv-ghost-01", "u2"), None);
    }

    #[test]
    fn a_television_lists_its_remotes_and_can_let_one_go() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

        // Two phones pick up the remote.
        let row = reg
            .attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 1);
        let row = reg
            .attach_controller("tv-salon-01", "sock-b", "Chrome", "u2", "bob", None)
            .expect("attached");
        assert_eq!(
            row.controllers.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Chrome", "iPhone"],
            "listed in a stable order, so the TV's list does not reshuffle"
        );
        // The row a viewer sees names the person, never their account id.
        assert!(row.controllers.iter().any(|c| c.username == "bob"));

        // Re-announcing the same thing is not a change worth a frame.
        assert!(reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).is_none());

        // Letting one go leaves exactly the other, and names the account to tell.
        let (row, owner) = reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");
        assert_eq!(owner, "u2");
        assert_eq!(row.controllers.len(), 1);
        assert_eq!(row.controllers[0].name, "iPhone");
        // Kicking what is already gone changes nothing.
        assert!(reg.kick_controller("tv-salon-01", "sock-b").is_none());

        // And the sender's own socket closing takes it off whatever it drove.
        let rows = reg.detach_controller("sock-a");
        assert_eq!(rows.len(), 1);
        assert!(rows[0].controllers.is_empty());
        assert!(reg.detach_controller("sock-a").is_empty());
    }

    #[test]
    fn a_television_can_only_disconnect_its_own_remotes() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        announce_ok(&reg, beat("tv-chambre-02", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).expect("attached");

        // The roster is readable by every viewer and carries controller ids, so
        // "disconnect this id" from the WRONG set has to be nothing at all -
        // otherwise one television could evict the remote driving another.
        assert!(reg.kick_controller("tv-chambre-02", "sock-a").is_none());
        assert_eq!(reg.list().iter().flat_map(|r| &r.controllers).count(), 1);
    }

    #[test]
    fn a_phone_that_reconnects_replaces_itself_instead_of_doubling() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-old", "iPhone", "u1", "alice", None).expect("attached");

        // Same phone, new socket: the old one is still on the roster because the
        // server has not noticed it die yet.
        let row = reg
            .attach_controller("tv-salon-01", "sock-new", "iPhone", "u1", "alice", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 1, "one device, one row");
        assert_eq!(row.controllers[0].id, "sock-new");

        // Somebody else's phone of the same make is a different remote.
        let row = reg
            .attach_controller("tv-salon-01", "sock-bob", "iPhone", "u2", "bob", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 2);
    }

    #[test]
    fn the_remote_list_is_bounded() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        // Distinct devices: two sockets calling themselves the same phone are one
        // remote by design (see the supersede test), so a flood has to be named.
        for n in 0..MAX_CONTROLLERS {
            assert!(
                reg.attach_controller(
                    "tv-salon-01",
                    &format!("sock-{n}"),
                    &format!("Phone {n}"),
                    "u1",
                    "alice",
                    None
                )
                .is_some()
            );
        }
        // Beyond the cap a newcomer is refused rather than pushing a real remote
        // out of a television's status bar.
        assert!(
            reg.attach_controller("tv-salon-01", "sock-flood", "Phone flood", "u1", "alice", None)
                .is_none()
        );
        assert_eq!(reg.list()[0].controllers.len(), MAX_CONTROLLERS);
    }

    #[test]
    fn a_remote_for_a_receiver_that_is_gone_is_refused() {
        let reg = Registry::new();
        assert!(reg.attach_controller("tv-ghost-01", "sock-a", "iPhone", "u1", "alice", None).is_none());
        assert!(reg.kick_controller("tv-ghost-01", "sock-a").is_none());
    }

    #[test]
    fn positions_are_clamped_before_they_reach_the_tv() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        let seek = reg
            .enqueue("tv-salon-01", CastCommand::Seek { position_ms: -5 })
            .unwrap();
        assert_eq!(seek.command, CastCommand::Seek { position_ms: 0 });
        let skip = reg
            .enqueue("tv-salon-01", CastCommand::Skip { delta_ms: i64::MIN })
            .unwrap();
        assert_eq!(skip.command, CastCommand::Skip { delta_ms: -MAX_SKIP_MS });
        let play = reg
            .enqueue(
                "tv-salon-01",
                CastCommand::Play { item_id: "it1".into(), position_ms: i64::MAX },
            )
            .unwrap();
        assert_eq!(play.command, CastCommand::Play { item_id: "it1".into(), position_ms: MAX_SKIP_MS });
    }
}
