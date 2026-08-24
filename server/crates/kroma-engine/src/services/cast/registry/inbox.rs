use std::time::Instant;

use crate::model::{CastCommand, CastCommandEnvelope};

use super::{Registry, MAX_INBOX, MAX_SKIP_MS};

#[cfg(test)]
mod tests;

impl Registry {
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
        let entry = map
            .get_mut(receiver_id)
            .filter(|r| r.live() && r.user_id == user_id)?;
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
}

// Bounds the stored numbers so a hostile sender cannot hand the TV a position
// that overflows its clock arithmetic.
fn clamp(command: CastCommand) -> CastCommand {
    match command {
        CastCommand::Play {
            item_id,
            position_ms,
        } => CastCommand::Play {
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
