//! The points this module answers, and the ones it calls.
//!
//! One file per point pair, each owning the JSON its side of the wire reads or
//! writes. Nothing here names a peer module: a consumer asks the host for a point
//! name and the host answers with whoever is running.

pub mod indexers;
pub mod ledger;
pub mod vpn;
