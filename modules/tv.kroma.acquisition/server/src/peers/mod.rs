//! The points this module calls, and the JSON it sends and reads on each.
//!
//! One file per point family, each declaring the fields THIS module needs. It
//! names no peer module: it asks the host for a point and the host answers with
//! whoever is running, so a provider can be swapped, disabled or replaced by one
//! that did not exist when this shipped.

pub mod downloads;
pub mod indexers;
