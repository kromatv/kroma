use serde::Serialize;

use super::ReleaseNotes;

/// One release as a reader receives it: its notes in their language.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseView {
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(flatten)]
    pub notes: ReleaseNotes,
}

/// `GET /api/releases`: every release this server has reached, newest first.
/// `unseen` names the one a client opens on its own, and is absent once the
/// reader has been shown it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleasesView {
    pub current: String,
    pub unseen: Option<String>,
    pub releases: Vec<ReleaseView>,
}
