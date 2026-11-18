use serde::Serialize;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum Connected {
    #[serde(rename_all = "camelCase")]
    Ready {
        sign_in: String,
        servers: Vec<ServerRef>,
    },
    #[serde(rename_all = "camelCase")]
    Pending {
        pending: String,
        url: String,
        expires_at: i64,
    },
    Refused {
        reason: Refusal,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Refusal {
    Credentials,
    Unreachable,
    NotAdministrator,
    Expired,
    Other,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct ServerRef {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Survey {
    pub libraries: Vec<Library>,
    pub users: Vec<User>,
    pub counts: Counts,
    pub left_behind: Vec<&'static str>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Library {
    pub id: String,
    pub name: String,
    pub kind: LibraryKind,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LibraryKind {
    Movies,
    Shows,
    Other,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct User {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub signed_in: bool,
    pub all_libraries: bool,
    pub libraries: Vec<String>,
    pub finer_limits: Vec<&'static str>,
    pub state_locked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_needs: Option<&'static str>,
}

/// How much the server holds. Watch states are not counted: counting them
/// would read every library once for every user.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct Counts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titles: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plays: Option<u64>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct TitlePage {
    pub titles: Vec<Title>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Title {
    pub id: String,
    pub kind: TitleKind,
    pub paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "ExternalIds::is_empty")]
    pub ids: ExternalIds,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series: Option<Series>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub season: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episode: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TitleKind {
    Movie,
    Episode,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub(crate) struct ExternalIds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tmdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tvdb: Option<String>,
}

impl ExternalIds {
    pub(crate) fn is_empty(&self) -> bool {
        self.tmdb.is_none() && self.imdb.is_none() && self.tvdb.is_none()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub(crate) struct Series {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "ExternalIds::is_empty")]
    pub ids: ExternalIds,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct StatePage {
    pub states: Vec<WatchState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchState {
    pub title: String,
    pub watched: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<i64>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct PlayPage {
    pub plays: Vec<Play>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Play {
    pub id: String,
    pub user: String,
    pub title: String,
    pub played_at: i64,
}
