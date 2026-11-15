use std::net::Ipv6Addr;
use std::sync::{Mutex, PoisonError};

use super::reach::shares_a_prefix;

const FRESH_MS: i64 = 60_000;

struct Listing {
    own_v6: Vec<Ipv6Addr>,
    at_ms: i64,
}

/// The global IPv6 addresses this machine holds, listed at most once a minute:
/// every request from a public IPv6 address asks, and a prefix changes rarely.
pub struct Neighbourhood {
    last: Mutex<Option<Listing>>,
}

impl Neighbourhood {
    pub const fn new() -> Self {
        Self {
            last: Mutex::new(None),
        }
    }

    /// Whether `client` is inside a /64 of the addresses `list` returned, the
    /// last time it was asked.
    pub fn holds(
        &self,
        client: Ipv6Addr,
        now_ms: i64,
        list: impl FnOnce() -> Vec<Ipv6Addr>,
    ) -> bool {
        let mut last = self.last.lock().unwrap_or_else(PoisonError::into_inner);
        let listing = match last.take() {
            Some(listing) if now_ms - listing.at_ms < FRESH_MS => listing,
            _ => Listing {
                own_v6: list(),
                at_ms: now_ms,
            },
        };
        shares_a_prefix(client, &last.insert(listing).own_v6)
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    const MINUTE_MS: i64 = 60_000;

    fn v6(ip: &str) -> Ipv6Addr {
        ip.parse().unwrap()
    }

    #[test]
    fn a_client_inside_a_prefix_this_machine_holds_is_a_neighbour() {
        let neighbourhood = Neighbourhood::new();
        let own = || vec![v6("2001:db8:1:2::10")];

        assert!(neighbourhood.holds(v6("2001:db8:1:2::99"), 0, own));
        assert!(!neighbourhood.holds(v6("2001:db8:1:3::99"), 0, own));
    }

    #[test]
    fn the_interfaces_are_listed_once_and_held_for_a_minute() {
        let neighbourhood = Neighbourhood::new();
        let listed = Cell::new(0);
        let own = || {
            listed.set(listed.get() + 1);
            vec![v6("2001:db8:1:2::10")]
        };

        neighbourhood.holds(v6("2001:db8:1:2::99"), 0, own);
        neighbourhood.holds(v6("2001:db8:1:2::99"), MINUTE_MS - 1, own);

        assert_eq!(listed.get(), 1);
    }

    #[test]
    fn a_prefix_that_changed_is_seen_within_the_minute_after() {
        let neighbourhood = Neighbourhood::new();
        neighbourhood.holds(v6("2001:db8:9:9::99"), 0, || vec![v6("2001:db8:1:2::10")]);

        let held = neighbourhood.holds(v6("2001:db8:9:9::99"), MINUTE_MS, || {
            vec![v6("2001:db8:9:9::10")]
        });

        assert!(held);
    }
}
