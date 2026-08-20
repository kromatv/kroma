//! TMDB discovery wire types: what the request flow browses before a request
//! exists.

use serde::Serialize;

use crate::metadata::{CastMember, CrewMember};

use super::{RequestKind, RequestStatus};

/// One TMDB discovery result, flagged against the local catalog + open
/// requests so cards can render Play / status chip / request button directly.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverEntry {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub overview: Option<String>,
    pub rating: Option<f32>,
    pub in_library: bool,
    // The local catalog id when `in_library` (deep-link to the real fiche).
    pub local_id: Option<String>,
    // The open request covering this title, when one exists.
    pub request_id: Option<String>,
    pub request_status: Option<RequestStatus>,
    // Live download progress (0..1) while downloading/importing.
    #[serde(default)]
    pub request_progress: Option<f64>,
}

/// `GET /api/discover/search` / `GET /api/discover/trending`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverResponse {
    pub results: Vec<DiscoverEntry>,
    pub page: u32,
    pub total_pages: u32,
}

/// One season row in a show's discovery detail (drives the season picker).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverSeason {
    pub season: u32,
    pub name: Option<String>,
    pub episode_count: u32,
    pub air_date: Option<String>,
    // Every episode of this season is already in the library.
    pub available: bool,
    // How many of the season's episodes are on disk (for "4/6" partial state).
    pub episodes_available: u32,
    // Covered by an open request.
    pub requested: bool,
}

/// `GET /api/discover/{movie,tv}/:tmdbId`: the request-flow detail page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverDetail {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub overview: Option<String>,
    pub tagline: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f32>,
    pub runtime_min: Option<u32>,
    // Empty for movies.
    pub seasons: Vec<DiscoverSeason>,
    // Top-billed cast (name + character + photo), from TMDB credits. Empty when
    // the provider returned none.
    #[serde(default)]
    pub cast: Vec<CastMember>,
    // Key crew (directors / creators / writers), for the "Réalisation" line.
    #[serde(default)]
    pub crew: Vec<CrewMember>,
    // "Titres similaires" TMDB recommendations, flagged against the local
    // catalog + open requests so each tile deep-links correctly.
    #[serde(default)]
    pub similar: Vec<DiscoverEntry>,
    pub in_library: bool,
    pub local_id: Option<String>,
    pub request_id: Option<String>,
    pub request_status: Option<RequestStatus>,
    // Live download progress (0..1) while the request is downloading/importing.
    #[serde(default)]
    pub request_progress: Option<f64>,
    // TMDB airing status (show: "Returning Series"/"Ended"/…; movie:
    // "Released"/…), for the "coming soon" badge. `None` when unknown.
    pub air_status: Option<String>,
    // Next air date (`YYYY-MM-DD`): a show's next episode, or a movie's soonest
    // availability. `None` when nothing is upcoming.
    pub next_air_date: Option<String>,
}
