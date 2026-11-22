//! Catalog writes: metadata attachment, ffprobe results and the scan diff-sync.
//!
//! Three writers, re-exported flat here so the public `db::<item>` paths resolve
//! unchanged: [`metadata`] attaches what enrichment resolved, [`probe`] records
//! what ffprobe found, and [`sync`] with [`scanned_files`] diff-sync what a
//! library scan saw against what the database already holds.

mod episode_guide;
mod metadata;
mod probe;
mod probe_result;
mod prune;
mod scanned_files;
mod sync;
mod unsettled;

#[cfg(test)]
mod test_support;

pub use episode_guide::*;
pub use metadata::*;
pub use probe::*;
pub use probe_result::*;
pub use prune::drop_unconfigured_libraries;
pub use sync::*;
pub use unsettled::{unsettle_shows, unsettled_shows, UNSETTLED_SHOWS_KEY};

#[cfg(test)]
mod stored_ratings_tests;
