use std::collections::HashMap;

use kroma_primitives::clean_label as clean;

use crate::model::{CastPlayback, MediaItem};

use super::{
    Announce, Announced, Hello, Receiver, Registry, StateChange, MAX_NAME,
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

        let arriving = !map.contains_key(&ann.receiver_id);
        let changed = match admission(&map, &ann, user_id) {
            Ok(changed) => changed,
            Err(refused) => return refused,
        };

        let entry = map
            .entry(ann.receiver_id.clone())
            .or_insert_with(|| Receiver::new(&ann.receiver_id, user_id));
        entry.name = name;
        entry.platform = platform;
        entry.username = username.to_string();
        entry.network = network;
        entry.refresh(ann.playback, item);

        let claimed = arriving
            .then(|| self.claim(&ann.receiver_id, user_id))
            .flatten();
        entry.replay(ann.last_applied_seq, claimed);
        let commands = entry.inbox.iter().cloned().collect();
        Announced::Ok { commands, changed }
    }

    /// Register a receiver whose presence is its socket, not a heartbeat: a set
    /// switched off leaves every picker at once instead of aging out of the TTL.
    pub fn attach(
        &self,
        hello: Hello,
        user_id: &str,
        username: &str,
        network: String,
    ) -> Announced {
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
        entry.refresh(playback, item);
        Some(if material {
            StateChange::Row(Box::new(entry.view()))
        } else {
            entry.position_change()
        })
    }
}

fn admission(
    map: &HashMap<String, Receiver>,
    ann: &Announce,
    user_id: &str,
) -> Result<bool, Announced> {
    match map.get(&ann.receiver_id) {
        Some(r) if r.user_id != user_id => Err(Announced::Taken),
        Some(r) => Ok(r.differs(ann.playback.as_ref()) || r.name != clean(&ann.name, MAX_NAME)),
        None if map.len() >= MAX_RECEIVERS => Err(Announced::Full),
        None => Ok(true),
    }
}
