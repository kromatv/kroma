//! Cast: the live **receiver** roster - which TVs are up right now and can be
//! driven from a phone or a browser.
//!
//! A TV heartbeats `POST /api/cast/announce` (~10 s) with its name and what it is
//! playing; senders read the roster and post commands, which queue in the
//! receiver's inbox and are pushed over the event bus. Like the playback and
//! quick-connect registries this is **in-memory** - "which TVs are alive" is
//! process-local state, so a restart simply re-learns it on the next heartbeat.
//!
//! Security shape (the whole point of the sequencing and the ownership binding):
//!
//! - A receiver id is **bound to the account that first announced it**. Another
//!   account claiming the same id is refused, so nobody can impersonate the
//!   living-room TV to intercept the commands meant for it.
//! - Commands carry a monotonic `seq` and are only dropped from the inbox once
//!   the receiver **acks** them. A lost push is retried on the next heartbeat and
//!   the receiver applies each one exactly once.
//! - The roster is bounded ([`MAX_RECEIVERS`]) and so is each receiver's inbox, so an
//!   authenticated client cannot grow either without bound.
//! - Nothing in the served roster is privileged: no IP, no token, no account id -
//!   just the display name, the platform and what is on screen.

mod registry;

pub use registry::*;
