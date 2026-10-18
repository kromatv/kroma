//! Monitoring: the titles the server wants to hold, and how a show's episodes
//! join that want.

use serde::{Deserialize, Serialize};

use super::{EpisodeRef, RequestKind};

/// When a monitored film becomes worth searching for.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MinAvailability {
    Announced,
    InCinemas,
    #[default]
    Released,
}

impl MinAvailability {
    pub fn as_str(self) -> &'static str {
        match self {
            MinAvailability::Announced => "announced",
            MinAvailability::InCinemas => "inCinemas",
            MinAvailability::Released => "released",
        }
    }

    pub fn parse(s: &str) -> Option<MinAvailability> {
        match s {
            "announced" => Some(MinAvailability::Announced),
            "inCinemas" => Some(MinAvailability::InCinemas),
            "released" => Some(MinAvailability::Released),
            _ => None,
        }
    }
}

/// Which episodes of a show start out monitored. Applied once; each episode can
/// be switched on its own afterwards. `Recent` is the last three months and
/// everything still to come.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MonitorPreset {
    All,
    Future,
    Missing,
    Recent,
    Existing,
    FirstSeason,
    LatestSeason,
    Pilot,
    None,
}

/// A title the server wants to hold. For a show, `seasons` are the seasons whose
/// newly announced episodes join the ledger, and `monitor_new_seasons` adds a
/// season TMDB announces above `last_season` to them. `known_episodes` is the
/// last episode of each season TMDB had listed, so "newly announced" is what
/// came after it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoredTitle {
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub seasons: Vec<u32>,
    pub monitor_new_seasons: bool,
    pub min_availability: MinAvailability,
    #[serde(skip)]
    pub last_season: Option<u32>,
    pub added_by: Option<String>,
    pub added_at: i64,
    pub updated_at: i64,
    pub original_language: Option<String>,
    pub air_status: Option<String>,
    #[serde(skip)]
    pub refreshed_at: Option<i64>,
    #[serde(skip)]
    pub known_episodes: std::collections::BTreeMap<u32, u32>,
    pub aliases: Vec<String>,
}

/// One monitored title with how much of it the library holds, for the
/// monitored-titles list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoredSummary {
    #[serde(flatten)]
    pub title: MonitoredTitle,
    pub monitored: u32,
    pub available: u32,
    pub missing: u32,
    pub grabbed: u32,
}

/// What an acquisition module made of a "search now": whether it started, how
/// many units it aimed at, and the word for why it did not (`busy`,
/// `noIndexer`, `vpnClosed`, `noModule`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNow {
    pub started: bool,
    #[serde(default)]
    pub units: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl SearchNow {
    pub fn refused(reason: &str) -> Self {
        Self {
            started: false,
            units: 0,
            reason: Some(reason.to_string()),
        }
    }
}

/// One title of the library, with what monitoring knows of it. `tmdb_id` is
/// absent for a title no provider matched, which nothing can monitor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTitle {
    pub kind: RequestKind,
    pub tmdb_id: Option<u64>,
    pub local_id: Option<String>,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub added_at: Option<String>,
    pub on_disk: u32,
    pub season_count: u32,
    pub size_bytes: i64,
    pub monitored: bool,
    pub monitored_units: u32,
    pub available: u32,
    pub missing: u32,
    pub grabbed: u32,
    pub air_status: Option<String>,
    pub next_air_date: Option<String>,
}

/// `PUT /api/monitoring/:kind/:tmdbId` body. Monitors the title when it is not
/// yet; `preset` is applied to a show's episodes, and absent fields keep what
/// the title has. `monitor_specials` widens the preset to season 0, which it
/// otherwise leaves alone.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorBody {
    #[serde(default)]
    pub preset: Option<MonitorPreset>,
    #[serde(default)]
    pub monitor_specials: bool,
    #[serde(default)]
    pub monitor_new_seasons: Option<bool>,
    #[serde(default)]
    pub min_availability: Option<MinAvailability>,
    #[serde(default)]
    pub search_now: bool,
}

/// `POST /api/monitoring/bulk` body: the same settings for many titles at once.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMonitorBody {
    pub titles: Vec<TitleRef>,
    #[serde(flatten)]
    pub settings: MonitorBody,
}

/// A title by its TMDB identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleRef {
    pub kind: RequestKind,
    pub tmdb_id: u64,
}

/// `PUT /api/monitoring/show/:tmdbId/episodes` body: switch whole seasons and
/// single episodes on or off. A season switched on also takes the episodes TMDB
/// announces in it later.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeMonitoringBody {
    #[serde(default)]
    pub seasons: Vec<SeasonSwitch>,
    #[serde(default)]
    pub episodes: Vec<EpisodeSwitch>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonSwitch {
    pub season: u32,
    pub monitored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeSwitch {
    #[serde(flatten)]
    pub episode: EpisodeRef,
    pub monitored: bool,
}

/// `POST /api/monitoring/:kind/:tmdbId/search` body: which of the title's
/// missing units to look for. An empty list means every one of them.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchUnitsBody {
    #[serde(default)]
    pub units: Vec<EpisodeRef>,
}
