use crate::infra::events::{Bus, ServerEvent};

use super::{Registry, REAP_INTERVAL};

#[cfg(test)]
mod tests;

impl Registry {
    pub(super) fn reap(&self) -> Vec<(String, String)> {
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
