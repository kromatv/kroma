//! A ceiling on how often one caller may reach a route nobody authenticates to.
//!
//! Process-local and best-effort, like [`crate::services::loginguard`]: it makes
//! a flood cost something without ever standing in for the rules that decide
//! what a request may actually do.

use std::collections::HashMap;
use std::sync::Mutex;

// A flood arriving from a great many distinct addresses must not grow the map
// without bound.
const MAX_KEYS: usize = 10_000;

struct Window {
    started_at: i64,
    hits: u32,
}

/// A fixed window per key: `limit` attempts every `window_secs`, counted as they
/// arrive.
pub struct Throttle {
    windows: Mutex<HashMap<String, Window>>,
    limit: u32,
    window_secs: i64,
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

impl Throttle {
    pub fn new(limit: u32, window_secs: i64) -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            limit,
            window_secs,
        }
    }

    /// Count one attempt by `key` and say whether it is still inside the
    /// ceiling. The attempt is counted either way, so a caller that keeps asking
    /// keeps being refused for the rest of its window.
    pub fn admit(&self, key: &str) -> bool {
        let mut windows = self.windows.lock().unwrap();
        let now = now();
        self.prune(&mut windows, now);
        let window = windows.entry(key.to_string()).or_insert(Window {
            started_at: now,
            hits: 0,
        });
        if now - window.started_at >= self.window_secs {
            *window = Window {
                started_at: now,
                hits: 0,
            };
        }
        window.hits += 1;
        window.hits <= self.limit
    }

    fn prune(&self, windows: &mut HashMap<String, Window>, now: i64) {
        if windows.len() < MAX_KEYS {
            return;
        }
        windows.retain(|_, w| now - w.started_at < self.window_secs);
        // Every window still open: a flood of distinct addresses buys itself one
        // fresh window rather than an unbounded map, or a lockout of whoever it
        // would otherwise have crowded out of it.
        if windows.len() >= MAX_KEYS {
            windows.clear();
        }
    }

    #[cfg(test)]
    pub(super) fn age(&self, secs: i64) {
        for window in self.windows.lock().unwrap().values_mut() {
            window.started_at -= secs;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CALLER: &str = "192.168.1.20";

    #[test]
    fn a_caller_is_admitted_up_to_the_ceiling_and_refused_past_it() {
        let throttle = Throttle::new(3, 60);
        for attempt in 1..=3 {
            assert!(throttle.admit(CALLER), "refused attempt {attempt}");
        }
        assert!(!throttle.admit(CALLER));
        assert!(
            !throttle.admit(CALLER),
            "asking again does not buy a slot back"
        );
    }

    #[test]
    fn the_next_window_starts_the_count_over() {
        let throttle = Throttle::new(1, 60);
        assert!(throttle.admit(CALLER));
        assert!(!throttle.admit(CALLER));

        throttle.age(60);
        assert!(throttle.admit(CALLER));
    }

    #[test]
    fn one_caller_never_spends_anothers_share() {
        let throttle = Throttle::new(1, 60);
        assert!(throttle.admit(CALLER));
        assert!(!throttle.admit(CALLER));
        assert!(throttle.admit("192.168.1.50"));
    }

    fn crowded(throttle: &Throttle) {
        for n in 0..MAX_KEYS {
            throttle.admit(&format!("10.0.{}.{}", n / 256, n % 256));
        }
    }

    fn held(throttle: &Throttle) -> usize {
        throttle.windows.lock().unwrap().len()
    }

    // The map is keyed by caller, so a flood arriving from a great many distinct
    // addresses is the one thing that can grow it without bound.
    #[test]
    fn a_flood_of_addresses_starts_the_map_over_rather_than_growing_it() {
        let throttle = Throttle::new(1, 60);
        crowded(&throttle);
        assert_eq!(held(&throttle), MAX_KEYS);

        // Every window is still open, so there is nothing to retire and the map
        // starts over: a flood buys itself one fresh window, never a lockout of
        // whoever it would otherwise have crowded out.
        assert!(throttle.admit(CALLER));
        assert_eq!(held(&throttle), 1);
    }

    #[test]
    fn windows_that_have_run_out_are_retired_before_the_map_is_given_up_on() {
        let throttle = Throttle::new(1, 60);
        crowded(&throttle);
        throttle.age(60);

        // At the ceiling, but every window has run out: retiring them is enough,
        // so nobody inside a window they were still counting against loses it.
        assert!(throttle.admit(CALLER));
        assert_eq!(held(&throttle), 1);
    }
}
