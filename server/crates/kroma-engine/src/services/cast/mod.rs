//! Cast: the live receiver roster — which TVs are up right now and can be driven
//! from a phone or a browser. In-memory; presence is the event socket, so a
//! restart re-learns the roster as receivers reconnect.
//!
//! Security invariants: a receiver id is bound to the account that first announced
//! it, so nobody can impersonate the living-room TV to intercept its commands;
//! a command leaves the inbox only once acked, so a lost push is applied exactly
//! once; roster and inboxes are bounded; nothing served is privileged.

mod registry;

pub use registry::*;
