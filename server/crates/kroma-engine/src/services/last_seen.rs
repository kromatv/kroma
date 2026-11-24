//! When a user's `last_seen` is worth writing again while their devices keep
//! checking in.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

const EVERY: Duration = Duration::from_secs(60);

/// The last time each user's `last_seen` was written by this process.
#[derive(Default)]
pub struct LastSeen {
    written: Mutex<HashMap<String, Instant>>,
}

impl LastSeen {
    /// Whether `user_id`'s `last_seen` should be written now: the first time
    /// it is asked, then once a minute at most. A `true` counts as written.
    pub fn due(&self, user_id: &str) -> bool {
        self.due_at(user_id, Instant::now())
    }

    fn due_at(&self, user_id: &str, now: Instant) -> bool {
        let mut written = self.written.lock().unwrap_or_else(PoisonError::into_inner);
        let recent = written
            .get(user_id)
            .is_some_and(|at| now.saturating_duration_since(*at) < EVERY);
        if !recent {
            written.insert(user_id.to_string(), now);
        }
        !recent
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_user_is_due_the_first_time_and_not_again_within_the_minute() {
        let seen = LastSeen::default();
        let start = Instant::now();

        let first = seen.due_at("u1", start);
        let soon = seen.due_at("u1", start + Duration::from_secs(10));

        assert!(first);
        assert!(!soon);
    }

    #[test]
    fn a_user_is_due_again_once_the_minute_is_over() {
        let seen = LastSeen::default();
        let start = Instant::now();
        seen.due_at("u1", start);
        seen.due_at("u1", start + Duration::from_secs(30));

        let later = seen.due_at("u1", start + EVERY);

        assert!(later);
    }

    #[test]
    fn each_user_is_counted_on_their_own() {
        let seen = LastSeen::default();
        let start = Instant::now();
        seen.due_at("u1", start);

        let other = seen.due_at("u2", start);

        assert!(other);
    }
}
