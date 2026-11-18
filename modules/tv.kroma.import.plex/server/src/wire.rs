//! The JSON of the `importer` point, as this module reads and writes it. The
//! core has its own structs for the other end: the two ship on separate tags,
//! so the tests beside this file pin the JSON itself.
//!
//! An ask keeps only the fields this importer reads, and ignores the rest.

mod answers;
mod asks;

pub(crate) use answers::*;
pub(crate) use asks::*;

#[cfg(test)]
mod tests;
