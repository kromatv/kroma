//! Optional movie/show metadata enrichment via TMDB, enabled by a key in
//! `KROMA_TMDB_API_KEY`; inert without one. Shells out to `curl` rather than
//! pulling an HTTP/TLS dependency, as [`crate::infra::probe`] does `ffprobe`.

mod cache;
mod client;
pub mod company_search;
mod find;
pub mod person;
pub mod person_search;
mod search;
mod videos;

use kroma_requests::tmdb::common;

const MOST_OFFERED: usize = 10;

pub use cache::Cache;
pub(crate) use client::country_of;
pub use client::{facts_by_id, lookup, lookup_all, lookup_all_by_id, Target, TitleFacts};
pub(crate) use find::{find_id, Catalogue};
pub use videos::{title_videos, TitleVideos};
pub use kroma_requests::tmdb::{
    discover, season_episodes, season_episodes_multi, EpisodeArt, SeasonData,
};
