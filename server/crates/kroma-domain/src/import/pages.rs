use serde::{Deserialize, Serialize};

/// One page of a library's titles. No `next` means the last page.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TitlePage {
    pub titles: Vec<Title>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

/// One film or one episode of the other server. `title` and `year` are the
/// title's own, an episode's included. The show an episode belongs to is in
/// `series`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Title {
    pub id: String,
    #[serde(default)]
    pub kind: TitleKind,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(default)]
    pub ids: ExternalIds,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series: Option<Series>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<u32>,
}

/// `Other` is a title that is neither, which an import skips.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TitleKind {
    Movie,
    Episode,
    #[default]
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Series {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    pub ids: ExternalIds,
}

/// The ids other catalogues give a title, each as that catalogue writes it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExternalIds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tmdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imdb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tvdb: Option<String>,
}

/// One page of one user's watch state in one library.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatePage {
    pub states: Vec<WatchState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

/// What one user did with one title, by the title's id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchState {
    pub title: String,
    #[serde(default)]
    pub watched: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<i64>,
    #[serde(default)]
    pub favourite: bool,
}

/// One page of the plays the other server recorded, for every user.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayPage {
    pub plays: Vec<Play>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
}

/// One play. Its `id` is what lets a later import skip it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Play {
    pub id: String,
    pub user: String,
    pub title: String,
    pub played_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}
