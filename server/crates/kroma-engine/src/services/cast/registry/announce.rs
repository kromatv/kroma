use std::collections::{HashMap, HashSet, VecDeque};
use std::time::Instant;

use kroma_primitives::clean_label as clean;

use crate::model::{CastPlayback, MediaItem};

use super::{
    trim_tracks, Announce, Announced, Hello, Receiver, Registry, StateChange, MAX_NAME,
    MAX_PLATFORM, MAX_RECEIVERS,
};

#[cfg(test)]
mod tests;

impl Registry {
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
}
