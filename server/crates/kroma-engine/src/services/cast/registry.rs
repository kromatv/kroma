//! The receiver store: heartbeat upsert, the per-receiver command inbox with its
//! ack/replay bookkeeping, and the TTL reaper.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

// Names a device chose for itself are rendered in other people's pickers, where
// a raw control character could forge a line; `clean_label` is what strips them.
use kroma_primitives::clean_label as clean;

use crate::infra::events::{Bus, ServerEvent};
use crate::model::{
    CastCommand, CastCommandEnvelope, CastController, CastNowPlaying, CastPlayback, CastReceiver,
    CastState, MediaItem,
};

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

// The account id is kept off the wire type: rows leave the server, and the
// username already names the profile.
struct ControllerEntry {
    view: CastController,
    user_id: String,
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

    /// Register or refresh a receiver. `item` is looked up by the caller only
    /// when [`Registry::wants_item`] says the stored one is stale.
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
        if ann.playback.is_none() {
            entry.item = None;
        }
        entry.playback = ann.playback.map(trim_tracks);
        entry.last_seen = Instant::now();

        // What is left after the ack is replayed: the WS push may never have landed.
        entry.inbox.retain(|c| c.seq > ann.last_applied_seq);
        let commands = entry.inbox.iter().cloned().collect();
        Announced::Ok { commands, changed }
    }

    /// Register a receiver whose presence is its socket, not a heartbeat: a set
    /// switched off leaves every picker at once instead of aging out of the TTL.
    pub fn attach(&self, hello: Hello, user_id: &str, username: &str, network: String) -> Announced {
        self.announce(
            Announce {
                receiver_id: hello.receiver_id,
                name: hello.name,
                platform: hello.platform,
                // A socket clears its inbox with `cast.ack` frames, not here.
                last_applied_seq: 0,
                playback: None,
            },
            user_id,
            username,
            network,
            None,
        )
    }

    /// Update what a socket-attached receiver is playing, and how senders should
    /// hear about it.
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

    /// `controller_id` is minted by the caller per socket, never by the client,
    /// so the identity a television shows cannot be forged. Owner-scoped like
    /// commanding: another account's set cannot be picked up at all.
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
        let entry = map.get_mut(receiver_id).filter(|r| r.live() && r.user_id == user_id)?;
        // Picking a set up again is deliberate, so it clears an earlier kick.
        entry.kicked.remove(user_id);
        let view = CastController {
            id: controller_id.to_string(),
            name: clean(name, MAX_NAME),
            username: username.to_string(),
            avatar_url: avatar_url.map(|u| clean(u, MAX_NAME)),
        };
        // One entry per device, not per socket: a phone that reconnects arrives
        // on a new socket before the server has noticed the old one die, and
        // would otherwise be listed twice with a ghost that cannot be kicked.
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
        // A supersede is a change even when this controller's own row is equal.
        if !replaced && entry.controllers.get(controller_id).map(|c| &c.view) == Some(&view) {
            return None;
        }
        entry
            .controllers
            .insert(controller_id.to_string(), ControllerEntry { view, user_id: user_id.to_string() });
        Some(entry.view())
    }

    /// Returns each changed row with the account it belongs to, so the caller can
    /// address the update to that account's sockets and no others.
    pub fn detach_controller(&self, controller_id: &str) -> Vec<(String, CastReceiver)> {
        let mut map = self.inner.write().unwrap();
        let mut changed = Vec::new();
        for receiver in map.values_mut() {
            if receiver.controllers.remove(controller_id).is_some() {
                changed.push((receiver.user_id.clone(), receiver.view()));
            }
        }
        changed
    }

    /// Scoped to `receiver_id` on purpose: rows carry controller ids to every
    /// device of the account, so removing by controller id alone would let one
    /// set evict a remote attached to another.
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

    /// Whether `user_id` may send this set an order: only the account the receiver
    /// is signed into. `None` for a receiver that is absent, dead, *or* another
    /// account's — the caller answers all three with a 404, so somebody else's
    /// TV is indistinguishable from no TV at all.
    pub fn may_command(&self, receiver_id: &str, user_id: &str) -> Option<bool> {
        let map = self.inner.read().unwrap();
        let entry = map.get(receiver_id).filter(|r| r.live() && r.user_id == user_id)?;
        Some(!entry.kicked.contains(user_id))
    }

    pub fn ack(&self, receiver_id: &str, seq: u64) {
        let mut map = self.inner.write().unwrap();
        if let Some(entry) = map.get_mut(receiver_id) {
            entry.inbox.retain(|c| c.seq > seq);
            entry.last_seen = Instant::now();
        }
    }

    /// Called on the socket's keepalive tick, so a paused film does not age out.
    pub fn touch(&self, receiver_id: &str) {
        let mut map = self.inner.write().unwrap();
        if let Some(entry) = map.get_mut(receiver_id) {
            entry.last_seen = Instant::now();
        }
    }

    /// Whether the caller must fetch `item_id` from the catalog before announcing.
    pub fn wants_item(&self, receiver_id: &str, item_id: &str) -> bool {
        self.inner
            .read()
            .unwrap()
            .get(receiver_id)
            .and_then(|r| r.item.as_ref())
            .is_none_or(|item| item.id != item_id)
    }

    /// Queue a command and hand back its seq. `None` when the receiver is gone or
    /// not `user_id`'s; the caller answers 404. The owner check is repeated here,
    /// under the same lock as the write, so a set that changes hands between an
    /// authorization check and the enqueue can never receive the order.
    pub fn enqueue(
        &self,
        receiver_id: &str,
        user_id: &str,
        command: CastCommand,
    ) -> Option<CastCommandEnvelope> {
        let mut map = self.inner.write().unwrap();
        let entry = map.get_mut(receiver_id).filter(|r| r.live() && r.user_id == user_id)?;
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
        self.inner.read().unwrap().get(receiver_id).filter(|r| r.live()).map(Receiver::view)
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

    fn reap(&self) -> Vec<(String, String)> {
        let mut map = self.inner.write().unwrap();
        let gone: Vec<(String, String)> = map
            .iter()
            .filter(|(_, r)| !r.live())
            .map(|(id, r)| (id.clone(), r.user_id.clone()))
            .collect();
        for (id, _) in &gone {
            map.remove(id);
        }
        gone
    }

    /// Backstop sweep: a socket-attached TV is dropped when its connection closes,
    /// so only HTTP heartbeaters wait out the TTL here.
    pub fn spawn_reaper(&self, events: Bus) {
        let reg = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(REAP_INTERVAL).await;
                for (receiver_id, owner) in reg.reap() {
                    events.publish_to(&owner, ServerEvent::CastReceiverGone { receiver_id });
                }
            }
        });
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

// Bounds the stored numbers so a hostile sender cannot hand the TV a position
// that overflows its clock arithmetic.
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
        assert!(reg.wants_item("tv-salon-01", "it1"));
        announce_ok(&reg, beat("tv-salon-01", 0, Some(playing("it1", 1000))), "u1", Some(item("it1")));
        assert!(!reg.wants_item("tv-salon-01", "it1"));
        assert!(reg.wants_item("tv-salon-01", "it2"));

        let list = reg.list("u1");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Salon");
        let np = list[0].now_playing.as_ref().expect("now playing");
        assert_eq!(np.item.id, "it1");
        assert_eq!(np.position_ms, 1000);
        assert_eq!(reg.row("tv-salon-01").map(|r| r.name), Some("Salon".to_string()));
    }

    #[test]
    fn another_account_never_sees_nor_drives_a_receiver() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

        assert!(reg.list("u2").is_empty(), "the roster is scoped to the signed-in account");
        // `None`, not `Some(false)`: the caller answers 404, so a stranger cannot
        // even learn the id exists.
        assert_eq!(reg.may_command("tv-salon-01", "u2"), None);
        assert!(reg.attach_controller("tv-salon-01", "sock-x", "iPhone", "u2", "bob", None).is_none());
        assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));
    }

    #[test]
    fn going_idle_clears_the_title() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, Some(playing("it1", 10))), "u1", Some(item("it1")));
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert!(reg.list("u1")[0].now_playing.is_none());
        assert!(reg.wants_item("tv-salon-01", "it1"));
    }

    #[test]
    fn another_account_cannot_claim_a_registered_receiver() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
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
        assert_eq!(reg.list("u1").len(), MAX_RECEIVERS);
    }

    #[test]
    fn commands_replay_until_they_are_acked() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        let first = reg.enqueue("tv-salon-01", "u1", CastCommand::Pause).expect("queued");
        let second = reg
            .enqueue("tv-salon-01", "u1", CastCommand::Seek { position_ms: 5000 })
            .expect("queued");
        assert_eq!((first.seq, second.seq), (1, 2));

        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), 2);
        let pending = announce_ok(&reg, beat("tv-salon-01", 1, None), "u1", None);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].seq, 2);
        assert!(announce_ok(&reg, beat("tv-salon-01", 2, None), "u1", None).is_empty());
        assert_eq!(reg.enqueue("tv-salon-01", "u1", CastCommand::Stop).unwrap().seq, 3);
    }

    #[test]
    fn the_inbox_is_bounded_and_keeps_the_freshest() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        for _ in 0..(MAX_INBOX + 5) {
            reg.enqueue("tv-salon-01", "u1", CastCommand::Pause);
        }
        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), MAX_INBOX);
        assert_eq!(pending.last().unwrap().seq, (MAX_INBOX + 5) as u64);
    }

    #[test]
    fn commands_for_an_unknown_or_dead_receiver_are_refused() {
        let reg = Registry::new();
        assert!(reg.enqueue("tv-ghost-01", "u1", CastCommand::Pause).is_none());
        assert!(reg.owner_of("tv-ghost-01").is_none());

        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(120);
        }
        assert!(reg.enqueue("tv-salon-01", "u1", CastCommand::Pause).is_none());
        assert!(reg.list("u1").is_empty());
        assert_eq!(reg.reap(), vec![("tv-salon-01".to_string(), "u1".to_string())]);
        assert!(reg.reap().is_empty());
    }

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
    fn roster_changes_are_announced_but_a_scrub_is_not() {
        let reg = Registry::new();
        let changed = |a: Announce, item: Option<MediaItem>| match reg.announce(a, "u1", "Alice", "LAN".into(), item) {
            Announced::Ok { changed, .. } => changed,
            _ => panic!("accepted"),
        };
        assert!(changed(beat("tv-salon-01", 0, Some(playing("it1", 0))), Some(item("it1"))));
        // Position alone moving is not a roster change: it rides cast.position.
        assert!(!changed(beat("tv-salon-01", 0, Some(playing("it1", 30_000))), None));
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
        let row = &reg.list("u1")[0];
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
        assert!(!valid_receiver_id("../../etc/passwd"));
        assert!(!valid_receiver_id("tv salon 01"));
        assert!(!valid_receiver_id("télé-salon"));
    }

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
        assert_eq!(reg.list("u1").len(), 1);

        let change = reg.set_state("tv-salon-01", Some(playing("it1", 0)), Some(item("it1")));
        assert!(matches!(change, Some(StateChange::Row(_))));

        let change = reg.set_state("tv-salon-01", Some(playing("it1", 30_000)), None);
        match change {
            Some(StateChange::Position { position_ms, state, .. }) => {
                assert_eq!(position_ms, 30_000);
                assert_eq!(state, CastState::Playing);
            }
            _ => panic!("a position-only update must not broadcast a row"),
        }

        let mut paused = playing("it1", 30_000);
        paused.state = CastState::Paused;
        assert!(matches!(
            reg.set_state("tv-salon-01", Some(paused), None),
            Some(StateChange::Row(_))
        ));

        assert!(matches!(
            reg.set_state("tv-salon-01", None, None),
            Some(StateChange::Row(_))
        ));
        assert!(reg.list("u1")[0].now_playing.is_none());

        assert!(matches!(reg.set_state("tv-salon-01", None, None), Some(StateChange::Nothing)));
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
        reg.enqueue("tv-salon-01", "u1", CastCommand::Pause);
        reg.enqueue("tv-salon-01", "u1", CastCommand::Stop);
        reg.ack("tv-salon-01", 1);
        let pending = announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].seq, 2);

        {
            let mut map = reg.inner.write().unwrap();
            map.get_mut("tv-salon-01").unwrap().last_seen = Instant::now() - Duration::from_secs(40);
        }
        reg.touch("tv-salon-01");
        assert!(reg.reap().is_empty());
        assert_eq!(reg.list("u1").len(), 1);
    }

    #[test]
    fn a_kicked_remote_stops_being_obeyed_until_it_picks_the_set_up_again() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-b", "iPad", "u1", "alice", None).expect("attached");

        assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));
        reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");

        assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(false));

        reg.attach_controller("tv-salon-01", "sock-c", "iPad", "u1", "alice", None).expect("attached");
        assert_eq!(reg.may_command("tv-salon-01", "u1"), Some(true));

        // Not a 403: the caller answers 404, so this cannot probe which ids exist.
        assert_eq!(reg.may_command("tv-ghost-01", "u1"), None);
    }

    #[test]
    fn a_television_lists_its_remotes_and_can_let_one_go() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);

        let row = reg
            .attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 1);
        let row = reg
            .attach_controller("tv-salon-01", "sock-b", "Chrome", "u1", "alice", None)
            .expect("attached");
        assert_eq!(
            row.controllers.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["Chrome", "iPhone"],
            "listed in a stable order, so the TV's list does not reshuffle"
        );

        assert!(reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).is_none());

        let (row, owner) = reg.kick_controller("tv-salon-01", "sock-b").expect("kicked");
        assert_eq!(owner, "u1");
        assert_eq!(row.controllers.len(), 1);
        assert_eq!(row.controllers[0].name, "iPhone");
        assert!(reg.kick_controller("tv-salon-01", "sock-b").is_none());

        let rows = reg.detach_controller("sock-a");
        assert_eq!(rows.len(), 1);
        let (owner, row) = &rows[0];
        assert_eq!(owner, "u1");
        assert!(row.controllers.is_empty());
        assert!(reg.detach_controller("sock-a").is_empty());
    }

    #[test]
    fn a_television_can_only_disconnect_its_own_remotes() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        announce_ok(&reg, beat("tv-chambre-02", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-a", "iPhone", "u1", "alice", None).expect("attached");

        assert!(reg.kick_controller("tv-chambre-02", "sock-a").is_none());
        assert_eq!(reg.list("u1").iter().flat_map(|r| &r.controllers).count(), 1);
    }

    #[test]
    fn a_phone_that_reconnects_replaces_itself_instead_of_doubling() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        reg.attach_controller("tv-salon-01", "sock-old", "iPhone", "u1", "alice", None).expect("attached");

        let row = reg
            .attach_controller("tv-salon-01", "sock-new", "iPhone", "u1", "alice", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 1, "one device, one row");
        assert_eq!(row.controllers[0].id, "sock-new");

        // A different device of the same account is a second remote, not a replay.
        let row = reg
            .attach_controller("tv-salon-01", "sock-ipad", "iPad", "u1", "alice", None)
            .expect("attached");
        assert_eq!(row.controllers.len(), 2);
    }

    #[test]
    fn the_remote_list_is_bounded() {
        let reg = Registry::new();
        announce_ok(&reg, beat("tv-salon-01", 0, None), "u1", None);
        // Two sockets naming the same phone are one remote, so these must differ.
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
        assert!(
            reg.attach_controller("tv-salon-01", "sock-flood", "Phone flood", "u1", "alice", None)
                .is_none()
        );
        assert_eq!(reg.list("u1")[0].controllers.len(), MAX_CONTROLLERS);
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
            .enqueue("tv-salon-01", "u1", CastCommand::Seek { position_ms: -5 })
            .unwrap();
        assert_eq!(seek.command, CastCommand::Seek { position_ms: 0 });
        let skip = reg
            .enqueue("tv-salon-01", "u1", CastCommand::Skip { delta_ms: i64::MIN })
            .unwrap();
        assert_eq!(skip.command, CastCommand::Skip { delta_ms: -MAX_SKIP_MS });
        let play = reg
            .enqueue(
                "tv-salon-01",
                "u1",
                CastCommand::Play { item_id: "it1".into(), position_ms: i64::MAX },
            )
            .unwrap();
        assert_eq!(play.command, CastCommand::Play { item_id: "it1".into(), position_ms: MAX_SKIP_MS });
    }
}
