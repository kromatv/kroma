use std::time::{Duration, Instant};

use crate::model::CastCommand;

use super::inbox::clamp;
use super::{Registry, MAX_RECEIVERS};

#[cfg(test)]
mod tests;

/// How long a play waits for the television it was sent to. A set that takes
/// longer to come back shows its home screen, not a film nobody remembers asking for.
pub const WAITING_TTL: Duration = Duration::from_secs(120);

pub(super) struct Waiting {
    user_id: String,
    command: CastCommand,
    since: Instant,
}

impl Waiting {
    fn fresh(&self) -> bool {
        self.since.elapsed() < WAITING_TTL
    }
}

impl Registry {
    /// Keep one order for a television that is being brought back. It is handed
    /// over the moment that receiver announces under the same account. A newer
    /// order for the same set replaces the older one.
    pub fn hold(&self, receiver_id: &str, user_id: &str, command: CastCommand) {
        let mut waiting = self.waiting.lock().unwrap();
        waiting.retain(|_, w| w.fresh());
        if waiting.len() >= MAX_RECEIVERS && !waiting.contains_key(receiver_id) {
            return;
        }
        waiting.insert(
            receiver_id.to_string(),
            Waiting {
                user_id: user_id.to_string(),
                command: clamp(command),
                since: Instant::now(),
            },
        );
    }

    pub(super) fn claim(&self, receiver_id: &str, user_id: &str) -> Option<CastCommand> {
        let mut waiting = self.waiting.lock().unwrap();
        let held = waiting.remove(receiver_id)?;
        (held.fresh() && held.user_id == user_id).then_some(held.command)
    }
}
