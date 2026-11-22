//! The `importer` point as this module reads and writes it: what the core
//! sends, and what goes back. The core owns its own structs for the same JSON.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

// No `Debug`: the form carries the password.
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct ConnectAsk {
    pub(crate) fields: BTreeMap<String, String>,
    pub(crate) pending: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct SurveyAsk {
    pub(crate) sign_in: String,
    pub(crate) server: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct TitlesAsk {
    pub(crate) sign_in: String,
    pub(crate) server: String,
    pub(crate) library: String,
    pub(crate) cursor: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct StatesAsk {
    pub(crate) sign_in: String,
    pub(crate) server: String,
    pub(crate) user: String,
    pub(crate) library: String,
    pub(crate) cursor: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct PlaysAsk {
    pub(crate) sign_in: String,
    pub(crate) server: String,
    pub(crate) cursor: Option<String>,
    pub(crate) changed_since: Option<i64>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct ForgetAsk {
    pub(crate) sign_in: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum Connected {
    #[serde(rename_all = "camelCase")]
    Ready {
        sign_in: String,
        servers: Vec<Server>,
    },
    Refused {
        reason: Refusal,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Refusal {
    Credentials,
    Unreachable,
    NotAdministrator,
    Expired,
    Unsupported,
    Other,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Server {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) address: String,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Survey {
    pub(crate) libraries: Vec<Library>,
    pub(crate) users: Vec<User>,
    pub(crate) counts: Counts,
    pub(crate) left_behind: Vec<&'static str>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Library {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) kind: LibraryKind,
    pub(crate) folders: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LibraryKind {
    Movies,
    Shows,
    Mixed,
    Other,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct User {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) signed_in: bool,
    pub(crate) all_libraries: bool,
    pub(crate) libraries: Vec<String>,
    pub(crate) finer_limits: Vec<&'static str>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct Counts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) titles: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) states: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) plays: Option<u64>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct TitlePage {
    pub(crate) titles: Vec<Title>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Title {
    pub(crate) id: String,
    pub(crate) kind: TitleKind,
    pub(crate) paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) year: Option<u32>,
    pub(crate) ids: ExternalIds,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) series: Option<Series>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) season: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) episode: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TitleKind {
    Movie,
    Episode,
    Other,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct Series {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) year: Option<u32>,
    pub(crate) ids: ExternalIds,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct ExternalIds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tmdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) imdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tvdb: Option<String>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct StatePage {
    pub(crate) states: Vec<WatchState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchState {
    pub(crate) title: String,
    pub(crate) watched: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) play_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) position_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_played_at: Option<i64>,
    pub(crate) favourite: bool,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct PlayPage {
    pub(crate) plays: Vec<Play>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Play {
    pub(crate) id: String,
    pub(crate) user: String,
    pub(crate) title: String,
    pub(crate) played_at: i64,
}

/// Jellyfin locks no user's watch state, so every unlock is refused as
/// `notLocked`, and the ask is never read.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum Unlocked {
    Refused { reason: UnlockRefusal },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum UnlockRefusal {
    NotLocked,
}
