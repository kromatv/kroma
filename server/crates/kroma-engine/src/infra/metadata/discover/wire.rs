use serde::Deserialize;

use super::super::common::{RawCreatedBy, RawCredits};

#[derive(Debug, Deserialize)]
pub(super) struct PageResp {
    #[serde(default)]
    pub(super) page: u32,
    #[serde(default)]
    pub(super) total_pages: u32,
    #[serde(default)]
    pub(super) results: Vec<RawHit>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawHit {
    pub(super) id: u64,
    #[serde(default)]
    pub(super) media_type: Option<String>,
    #[serde(default)]
    pub(super) title: Option<String>,
    #[serde(default)]
    pub(super) name: Option<String>,
    #[serde(default)]
    pub(super) original_title: Option<String>,
    #[serde(default)]
    pub(super) original_name: Option<String>,
    #[serde(default)]
    pub(super) overview: Option<String>,
    #[serde(default)]
    pub(super) poster_path: Option<String>,
    #[serde(default)]
    pub(super) backdrop_path: Option<String>,
    #[serde(default)]
    pub(super) release_date: Option<String>,
    #[serde(default)]
    pub(super) first_air_date: Option<String>,
    #[serde(default)]
    pub(super) vote_average: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub(super) struct DetailResp {
    #[serde(default)]
    pub(super) title: Option<String>,
    #[serde(default)]
    pub(super) name: Option<String>,
    #[serde(default)]
    pub(super) overview: Option<String>,
    #[serde(default)]
    pub(super) tagline: Option<String>,
    #[serde(default)]
    pub(super) poster_path: Option<String>,
    #[serde(default)]
    pub(super) backdrop_path: Option<String>,
    #[serde(default)]
    pub(super) release_date: Option<String>,
    #[serde(default)]
    pub(super) first_air_date: Option<String>,
    #[serde(default)]
    pub(super) vote_average: Option<f32>,
    #[serde(default)]
    pub(super) runtime: Option<u32>,
    #[serde(default)]
    pub(super) genres: Vec<RawGenre>,
    #[serde(default)]
    pub(super) imdb_id: Option<String>,
    #[serde(default)]
    pub(super) external_ids: Option<RawExternalIds>,
    #[serde(default)]
    pub(super) seasons: Vec<RawSeasonResp>,
    #[serde(default)]
    pub(super) credits: Option<RawCredits>,
    #[serde(default)]
    pub(super) created_by: Vec<RawCreatedBy>,
    #[serde(default)]
    pub(super) recommendations: Option<PageResp>,
    // Show: "Returning Series"/"Ended"/"Canceled"/"In Production"; movie:
    // "Released"/"Post Production"/…
    #[serde(default)]
    pub(super) status: Option<String>,
    #[serde(default)]
    pub(super) next_episode_to_air: Option<RawEpisodeStub>,
    // Parsed for the coming-soon calendar (later phase); not read yet.
    #[serde(default)]
    #[allow(dead_code)]
    pub(super) last_episode_to_air: Option<RawEpisodeStub>,
    // Backs the calendar's completeness check (later phase); not read yet.
    #[serde(default)]
    #[allow(dead_code)]
    pub(super) number_of_episodes: Option<u32>,
    #[serde(default)]
    pub(super) release_dates: Option<ReleaseDatesResp>,
    #[serde(default)]
    pub(super) original_language: Option<String>,
    #[serde(default)]
    pub(super) original_title: Option<String>,
    #[serde(default)]
    pub(super) original_name: Option<String>,
    #[serde(default)]
    pub(super) origin_country: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawGenre {
    pub(super) id: u32,
    pub(super) name: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawExternalIds {
    #[serde(default)]
    pub(super) imdb_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawSeasonResp {
    #[serde(default)]
    pub(super) season_number: Option<u32>,
    #[serde(default)]
    pub(super) name: Option<String>,
    #[serde(default)]
    pub(super) episode_count: Option<u32>,
    #[serde(default)]
    pub(super) air_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct RawEpisodeStub {
    #[serde(default)]
    pub(super) air_date: Option<String>,
    #[serde(default)]
    pub(super) season_number: Option<u32>,
    #[serde(default)]
    pub(super) episode_number: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ReleaseDatesResp {
    #[serde(default)]
    pub(super) results: Vec<ReleaseDatesCountry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ReleaseDatesCountry {
    #[serde(default)]
    pub(super) iso_3166_1: Option<String>,
    #[serde(default)]
    pub(super) release_dates: Vec<ReleaseDateEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ReleaseDateEntry {
    // 3 = theatrical, 4 = digital, 5 = physical (others exist).
    #[serde(rename = "type", default)]
    pub(super) kind: u32,
    #[serde(default)]
    pub(super) release_date: Option<String>,
}
