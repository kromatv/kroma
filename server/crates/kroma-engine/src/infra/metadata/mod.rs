//! Optional movie/show metadata enrichment via TMDB, enabled by a key in
//! `KROMA_TMDB_API_KEY`; inert without one. Shells out to `curl` rather than
//! pulling an HTTP/TLS dependency, as [`crate::infra::probe`] does `ffprobe`.

mod cache;
mod client;
#[cfg(test)]
pub(crate) use client::test_override;
mod common;
pub mod discover;
pub mod person;
mod search;

pub use cache::Cache;
pub use client::{
    curl_available, lookup, lookup_all, lookup_all_by_id, season_episodes, season_episodes_multi,
    EpisodeArt, SeasonData, Target,
};
