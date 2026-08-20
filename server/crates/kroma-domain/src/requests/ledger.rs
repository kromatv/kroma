//! A request's wanted ledger and the calendar/missing feeds built from it.

use serde::Serialize;

use super::{RequestCoverage, RequestKind};

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
