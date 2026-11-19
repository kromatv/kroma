//! Built-in demo content: rows with no file behind them, for a server that
//! cannot write the real thing. Demo items have `rel_path == None` /
//! `abs_path == None` and cannot be streamed.
//!
//! The file-backed demo library in [`media`] is what a server uses when it can:
//! same titles, actual bytes, scanned like any other library. This module is the
//! fallback for when there is no ffmpeg to write them with.

mod builders;
mod catalogue;
pub mod media;

pub use catalogue::demo_data;

const MOVIES: &str = "demo://movies";
const SHOWS: &str = "demo://shows";

/// Whether `id` names a library of the row-only demo catalogue.
pub fn is_demo_library(id: &str) -> bool {
    [MOVIES, SHOWS]
        .iter()
        .any(|seed| crate::services::scan::short_hash(seed) == id)
}
