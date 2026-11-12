//! Trailers for the KROMA player. A title's trailer is a YouTube video TMDB
//! lists; this module fetches it the way a YouTube client does, takes the H.264
//! picture and the uploader's own AAC track, and remuxes them into one
//! progressive MP4 the core caches and serves. Everything is Rust inside the
//! component: no helper program, no JavaScript runtime.
//!
//! The InnerTube clients it pretends to be are data (`clients.json` at the
//! module root), refreshed from the repository once a day, so the usual
//! YouTube change (a client version, a user agent) is fixed without a release.

mod innertube;
mod module;
mod mp4;
mod pick;
mod profiles;
mod serve;
#[cfg(test)]
mod test_support;
mod trailers;
mod web;

pub use module::MODULE;
pub use serve::routes;
pub use trailers::{Fetched, Trailers, VideoId, MAX_READ};

/// This module's id, which also names its folder under the data directory.
pub const MODULE_ID: &str = "tv.kroma.trailers";
