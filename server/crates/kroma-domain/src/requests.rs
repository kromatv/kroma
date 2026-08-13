//! Media requests (the "ask for a title" flow) + TMDB discovery wire types.
//! Pure data (serde + ts-rs); persistence lives in `crate::db`, orchestration
//! in `crate::services::requests`, the TMDB adapter in `crate::infra::metadata`.
//!
//! The JSON shape here is a public contract web/TV clients depend on it, so
//! field names and casing must not drift. Timestamps are epoch milliseconds.

use serde::{Deserialize, Serialize};

use crate::metadata::{CastMember, CrewMember};

/// What a request targets. Requests key on TMDB ids, so this mirrors TMDB's
/// movie/tv split under the catalog's own vocabulary (a "show", not a "tv").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequestKind {
    Movie,
    Show,
}

impl RequestKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RequestKind::Movie => "movie",
            RequestKind::Show => "show",
        }
    }
    pub fn parse(s: &str) -> Option<RequestKind> {
        match s {
            "movie" => Some(RequestKind::Movie),
            "show" => Some(RequestKind::Show),
            _ => None,
        }
    }
}

/// A request's lifecycle state. The DB stores the durable states; the transient
/// acquisition states (`searching`/`downloading`/`importing`) are derived from
/// the wanted/downloads ledgers when a view is built, so clients get one enum
/// for the whole status chip vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Pending,
    Approved,
    Searching,
    Downloading,
    Importing,
    Available,
    PartiallyAvailable,
    Failed,
    Denied,
}

impl RequestStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            RequestStatus::Pending => "pending",
            RequestStatus::Approved => "approved",
            RequestStatus::Searching => "searching",
            RequestStatus::Downloading => "downloading",
            RequestStatus::Importing => "importing",
            RequestStatus::Available => "available",
            RequestStatus::PartiallyAvailable => "partially_available",
            RequestStatus::Failed => "failed",
            RequestStatus::Denied => "denied",
        }
    }
    pub fn parse(s: &str) -> Option<RequestStatus> {
        match s {
            "pending" => Some(RequestStatus::Pending),
            "approved" => Some(RequestStatus::Approved),
            "searching" => Some(RequestStatus::Searching),
            "downloading" => Some(RequestStatus::Downloading),
            "importing" => Some(RequestStatus::Importing),
            "available" => Some(RequestStatus::Available),
            "partially_available" => Some(RequestStatus::PartiallyAvailable),
            "failed" => Some(RequestStatus::Failed),
            "denied" => Some(RequestStatus::Denied),
            _ => None,
        }
    }
}

/// One (season, episode) pair, for a request that targets individual episodes
/// rather than whole seasons. `1`-based, mirroring TMDB's numbering.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeRef {
    pub season: u32,
    pub episode: u32,
}

/// One media request, as listed to clients (the requester sees their own; a
/// `requests.manage` holder sees everyone's, with the requester hydrated).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRequest {
    pub id: String,
    pub kind: RequestKind,
    pub tmdb_id: u64,
    // Denormalized at request time so list views need no TMDB call.
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    // Requested season numbers; `None` = the whole show (or a movie).
    pub seasons: Option<Vec<u32>>,
    // Individual episodes requested alongside any full seasons. `None` = none.
    // A show's target is the union of `seasons` (full) and `episodes`; both
    // `None` = every season.
    pub episodes: Option<Vec<EpisodeRef>>,
    pub status: RequestStatus,
    pub requested_by: Option<String>,
    pub requested_by_name: Option<String>,
    pub reviewed_by: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    // Live download progress (0..1) when the request is `downloading` /
    // `importing`, derived from its download rows. `None` otherwise.
    #[serde(default)]
    pub progress: Option<f64>,
    // TMDB airing status, refreshed by the `acquisition.refresh` job (show:
    // "Returning Series"/"Ended"/…; movie: "Released"/"Post Production"/…).
    // `None` until the first refresh.
    pub air_status: Option<String>,
    // Next air date (`YYYY-MM-DD`): a show's next episode, or an unreleased
    // movie's soonest availability. `None` once nothing more is upcoming.
    pub next_air_date: Option<String>,
    // Epoch-ms of the last TMDB refresh (throttles the refresh pass). Internal:
    // never serialized to clients.
    #[serde(skip)]
    pub last_refresh_at: Option<i64>,
}

/// Status tallies for the admin queue's filter chips.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCounts {
    pub total: u32,
    pub pending: u32,
    pub active: u32,
    pub available: u32,
    pub denied: u32,
    pub failed: u32,
}

/// `GET /api/requests`.
#[derive(Debug, Clone, Serialize)]
pub struct RequestsView {
    pub requests: Vec<MediaRequest>,
    pub counts: RequestCounts,
}

/// One row of a request's wanted ledger: exactly what the search can be aimed
/// at, and what state that piece is in. `GET /api/requests/:id/wanted`, sorted
/// by season then episode; a movie request answers with one seasonless row.
/// `air_date` is `YYYY-MM-DD` or `None` for an undated row (legacy ledgers,
/// specials); `status` is `wanted` | `grabbed` | `available`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WantedEntry {
    pub id: String,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub air_date: Option<String>,
    pub status: String,
}

/// One season of the requested title as TMDB knows it, tallied against the
/// request's ledger and the library. `GET /api/requests/:id/ledger`, ascending;
/// a movie request answers with an empty list. The counts are over the whole
/// season, not the requested subset: `requested` is how much of it the request
/// covers, `on_disk` how much the library already holds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerSeason {
    pub season: u32,
    pub name: Option<String>,
    pub air_date: Option<String>,
    pub episode_count: u32,
    pub requested: u32,
    pub on_disk: u32,
}

/// One episode of a season, as TMDB describes it, joined with what the request
/// and the library know about it. `wanted_id` is `None` for an episode the
/// request does not cover: it can still be searched, it is simply not tracked.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEpisode {
    pub season: u32,
    pub episode: u32,
    pub name: Option<String>,
    pub overview: Option<String>,
    pub air_date: Option<String>,
    pub still_url: Option<String>,
    pub rating: Option<f32>,
    pub on_disk: bool,
    pub wanted_id: Option<String>,
    /// The wanted row's status (`wanted` | `grabbed` | `available`), or `None`
    /// when the request does not cover this episode.
    pub wanted_status: Option<String>,
    /// The catalog item this episode already is, when the library holds it: what
    /// a "watch it" link points at, and what says how good the copy is.
    pub item_id: Option<String>,
    pub video: Option<crate::media::VideoStream>,
    pub duration_ms: Option<i64>,
}

/// What a show request covers: the union of whole `seasons` and individual
/// `episodes`; both `None` means the whole show. The same shape
/// `PUT /api/requests/:id/coverage` accepts, so the editor reads and writes one
/// vocabulary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCoverage {
    pub seasons: Option<Vec<u32>>,
    pub episodes: Option<Vec<EpisodeRef>>,
}

/// `GET /api/requests/:id/ledger` the requested title as TMDB describes it,
/// which is wider than the request: an admin sees the seasons and episodes the
/// request left out, and what the library holds of them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLedgerView {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    /// `YYYY-MM-DD` in UTC, so the client dates "unaired" against the same clock
    /// the search gate uses.
    pub today: String,
    /// What the request covers right now, in the shape the coverage editor
    /// speaks. Named apart from `seasons` below, which is the TITLE's seasons.
    pub coverage: RequestCoverage,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub overview: Option<String>,
    pub seasons: Vec<LedgerSeason>,
    /// The catalog entry this title already is (a show id, or a movie's item
    /// id), when the library holds it at all.
    pub local_id: Option<String>,
    /// Movie only: whether the library already holds the film, and the soonest
    /// date it can be looked for. Always `false` / `None` for a show, whose
    /// answer is per episode.
    pub on_disk: bool,
    pub air_date: Option<String>,
}

/// `GET /api/requests/:id/ledger/:season` one season's episodes, fetched from
/// TMDB on demand so a twenty-season show is not twenty round trips a page load.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonLedgerView {
    pub season: u32,
    pub episodes: Vec<LedgerEpisode>,
}

/// One wanted item joined with its request's display fields, shared by two
/// feeds: the "coming soon" calendar (`GET /api/requests/calendar`, future-dated,
/// `air_date` always `Some`) and the "missing / wanted" list
/// (`GET /api/requests/missing`, already aired/released but not on disk, where
/// `air_date` may be `None` for an undated row). Emitted sorted (calendar: by
/// date; missing: by title then season/episode).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntry {
    // The parent request, or `None` for a library-scan "missing" row (a series
    // in the library with aired episodes not on disk, that was never requested).
    // The client turns such a row into a request when the user asks to watch it.
    pub request_id: Option<String>,
    pub tmdb_id: u64,
    pub kind: RequestKind,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    // Present for a show episode; `None` for a movie.
    pub season: Option<u32>,
    pub episode: Option<u32>,
    // `YYYY-MM-DD`. Always set on the calendar feed; may be `None` on the missing
    // feed (an undated aired row).
    pub air_date: Option<String>,
    // The wanted row's status (`wanted` / `grabbed`): a grabbed-but-unaired
    // episode is already secured, shown differently on the calendar.
    pub status: String,
}

/// `POST /api/requests` body.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequestBody {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    // For shows: the seasons to request; `None`/empty = every season.
    #[serde(default)]
    pub seasons: Option<Vec<u32>>,
    // For shows: individual episodes to request, unioned with `seasons`.
    // `None`/empty = no per-episode ask.
    #[serde(default)]
    pub episodes: Option<Vec<EpisodeRef>>,
}

/// `PUT /api/requests/:id/coverage` body: exactly what a show request covers
/// from now on. Both absent (or empty) means the WHOLE show; otherwise the union
/// of the named seasons and the named episodes. Unlike a second ask, this can
/// narrow as well as widen.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCoverageBody {
    #[serde(default)]
    pub seasons: Option<Vec<u32>>,
    #[serde(default)]
    pub episodes: Option<Vec<EpisodeRef>>,
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_request_kind_round_trips_through_its_stored_spelling() {
        for kind in [RequestKind::Movie, RequestKind::Show] {
            let stored = kind.as_str();
            assert_eq!(serde_json::to_string(&kind).unwrap(), format!("\"{stored}\""));
            assert_eq!(RequestKind::parse(stored), Some(kind));
        }
        assert_eq!(RequestKind::parse("season"), None);
    }

    #[test]
    fn every_status_including_the_transient_ones_round_trips() {
        for status in [
            RequestStatus::Pending,
            RequestStatus::Approved,
            RequestStatus::Searching,
            RequestStatus::Downloading,
            RequestStatus::Importing,
            RequestStatus::Available,
            RequestStatus::PartiallyAvailable,
            RequestStatus::Failed,
            RequestStatus::Denied,
        ] {
            let stored = status.as_str();
            assert_eq!(serde_json::to_string(&status).unwrap(), format!("\"{stored}\""));
            assert_eq!(RequestStatus::parse(stored), Some(status));
        }
        assert_eq!(RequestStatus::parse("partiallyAvailable"), None);
        assert_eq!(RequestStatus::parse("cancelled"), None);
    }
}
