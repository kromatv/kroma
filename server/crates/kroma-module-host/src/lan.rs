//! The local network as a capability: a module publishes a service or searches for
//! devices without holding a socket, and only if its manifest declares discovery.

use std::time::Duration;

pub use crate::outside::{LanReply, LanService};
use crate::outside::outside;

/// Publish `service` until [`withdraw`] or until the module stops.
pub fn announce(service: LanService) -> Result<u64, String> {
    outside()?.announce(service)
}

pub fn withdraw(announcement: u64) {
    if let Ok(outside) = outside() {
        outside.withdraw(announcement);
    }
}

/// One SSDP search for `target`, and everything that answers within `wait`.
pub fn search(target: &str, wait: Duration) -> Result<Vec<LanReply>, String> {
    outside()?.search(target, wait)
}

/// This machine's LAN addresses, the primary one first.
pub fn addresses() -> Vec<String> {
    outside().map(|outside| outside.addresses()).unwrap_or_default()
}
