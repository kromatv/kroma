//! Optional movie/show metadata enrichment via TMDB, enabled by a key in
//! `KROMA_TMDB_API_KEY`; inert without one. Shells out to `curl` rather than
//! pulling an HTTP/TLS dependency, as [`crate::infra::probe`] does `ffprobe`.

mod cache;
mod client;
pub mod person;
mod search;
mod videos;

use kroma_requests::tmdb::common;

pub use cache::Cache;
pub use client::{lookup, lookup_all, lookup_all_by_id, Target};
pub use videos::{title_videos, TitleVideos};
pub use kroma_requests::tmdb::{
    discover, season_episodes, season_episodes_multi, EpisodeArt, SeasonData,
};
