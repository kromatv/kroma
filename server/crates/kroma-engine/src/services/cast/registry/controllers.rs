use kroma_primitives::clean_label as clean;

use crate::model::{CastController, CastReceiver};

use super::{Registry, MAX_CONTROLLERS, MAX_NAME};

#[cfg(test)]
mod tests;

// The account id is kept off the wire type: rows leave the server, and the
// username already names the profile.
pub(super) struct ControllerEntry {
    pub(super) view: CastController,
    pub(super) user_id: String,
}

impl Registry {
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
}
