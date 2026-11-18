//! Another media server's household, as an importer describes it and the core
//! reads it. This is the JSON of the `importer` point, written out for a module
//! author in `modules/README.md`.
//!
//! An id is the other server's opaque string. A field ending in `Ms` counts
//! milliseconds and one ending in `At` is unix seconds. Every field but an id
//! may be absent, and an absent one reads as false, empty or unknown.

mod connect;
mod pages;
mod survey;

pub use connect::*;
pub use pages::*;
pub use survey::*;

#[cfg(test)]
mod tests;
