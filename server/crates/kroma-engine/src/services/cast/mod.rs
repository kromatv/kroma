//! Cast: the live **receiver** roster - which TVs are up right now and can be
//! driven from a phone or a browser.
//!
//! A TV attaches over the event socket it already holds (`cast.hello`), then
//! speaks only when something changes; senders read the roster and post commands,
//! which queue in the receiver's inbox and are pushed back over the same bus.
//! Presence is the connection: close it and the set leaves every picker at once.
//! An HTTP heartbeat (`POST /api/cast/announce`) remains for a receiver whose
//! socket will not come up. Like the playback and quick-connect registries this
//! is **in-memory** - "which TVs are alive" is process-local state, so a restart
//! simply re-learns it as sockets reconnect.
//!
//! Security shape (the whole point of the sequencing and the ownership binding):
//!
//! - A receiver id is **bound to the account that first announced it**. Another
//!   account claiming the same id is refused, so nobody can impersonate the
//!   living-room TV to intercept the commands meant for it.
//! - Commands carry a monotonic `seq` and are only dropped from the inbox once
//!   the receiver **acks** them, so a lost push is retried (over the socket on
//!   reconnect, or through the HTTP fallback) and applied exactly once.
//! - The roster is bounded ([`MAX_RECEIVERS`]) and so is each receiver's inbox, so an
//!   authenticated client cannot grow either without bound.
//! - Nothing in the served roster is privileged: no IP, no token, no account id -
//!   just the display name, the platform and what is on screen.

mod registry;

pub use registry::*;
