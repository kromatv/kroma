//! What the host answers a module's metadata lookups with.

use serde::{Deserialize, Serialize};

/// One episode of a season, as the provider names it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeInfo {
    pub episode: u32,
    pub name: Option<String>,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub still_url: Option<String>,
}

/// One TMDB title offered by the "fix the match" picker, with the confidence
/// [`crate::matching`] gives it against what the filename parsed to.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchCandidate {
    pub tmdb_id: u64,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub overview: Option<String>,
    pub rating: Option<f32>,
    // Confidence in `0.0..=1.0` that this is the title on disk.
    pub score: f32,
    pub current: bool,
}
