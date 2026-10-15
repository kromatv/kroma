//! Download wire types: the download queue + client config views, the naming /
//! organize shapes, and the VPN kill-switch status.

use serde::{Deserialize, Serialize};

/// The tunnel's state as this module sees it, reported on the `download-vpn`
/// point and drawn on the download queue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnStatusView {
    pub connected: bool,
    pub exit_ip: Option<String>,
    pub paused: bool,
}

/// One configured download client, as listed to admins (password write-only).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadClientView {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub url: String,
    pub username: String,
    pub has_password: bool,
    pub enabled: bool,
    pub priority: i32,
    pub created_at: i64,
    pub builtin: bool,
    pub state: EngineState,
    pub starting_for_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineState {
    Ready,
    Starting,
    Stopped,
    NotCompiled,
    Unknown,
}

/// How a download's title was decided. `Pinned` is the one that stops the
/// automatic pass looking again; `Unmatched` is it having looked and found
/// nothing, which absence (a row it has not reached yet) is not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchSource {
    Auto,
    Pinned,
    #[serde(rename = "none")]
    Unmatched,
}

impl MatchSource {
    pub fn parse(raw: &str) -> Option<Self> {
        Some(match raw {
            "auto" => Self::Auto,
            "pinned" => Self::Pinned,
            "none" => Self::Unmatched,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Pinned => "pinned",
            Self::Unmatched => "none",
        }
    }
}

/// `GET /download-clients`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadClientsView {
    pub clients: Vec<DownloadClientView>,
    pub rqbit_compiled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDownloadClientBody {
    pub kind: Option<String>,
    pub name: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
}

/// `POST /download-clients/:id/test` result.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientTestResult {
    pub ok: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// One download (grab), as listed in the admin queue. Live speed/ETA ride the
/// `download.progress` WS event; this is the durable row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadView {
    pub id: String,
    pub client_id: String,
    pub client_name: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub release_title: String,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub status: String,
    pub progress: f64,
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub peers_seen: u32,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub error: Option<String>,
    pub grabbed_at: i64,
    pub completed_at: Option<i64>,
    pub imported_at: Option<i64>,
    pub indexer_name: Option<String>,
    pub details_url: Option<String>,
    pub info_hash: Option<String>,
    pub poster_url: Option<String>,
    pub local_id: Option<String>,
    pub year: Option<u32>,
    pub tmdb_id: Option<u64>,
    pub match_source: Option<MatchSource>,
    pub lifetime_downloaded_bytes: u64,
    pub lifetime_uploaded_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageView {
    pub page: u32,
    pub per_page: u32,
    pub total: i64,
    pub page_count: u32,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub at_ms: i64,
    pub down_bps: u64,
    pub up_bps: u64,
    pub active: u32,
    pub peers: u32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatsView {
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub active: i64,
    pub by_status: std::collections::BTreeMap<String, i64>,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    pub history: Vec<SpeedSample>,
}

/// `GET /downloads`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadsView {
    pub downloads: Vec<DownloadView>,
    pub vpn: Option<VpnStatusView>,
    pub page: PageView,
    pub stats: DownloadStatsView,
}

/// The engine-wide throughput and parallelism ceilings. `0` is unlimited in
/// every field, which is also the default.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitsView {
    pub down_kbps: i64,
    pub up_kbps: i64,
    pub max_active: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchCandidateView {
    pub tmdb_id: u64,
    pub kind: String,
    pub title: String,
    pub year: Option<u32>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub score: f64,
}

/// `POST /downloads/torrent`: what an uploaded `.torrent` says about itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectedTorrent {
    pub magnet: String,
    pub info_hash: String,
    pub release_title: String,
    pub size_bytes: u64,
    pub kind: String,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFileView {
    pub index: usize,
    pub path: String,
    pub size_bytes: u64,
    pub is_video: bool,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

/// `GET /downloads/{id}/contents`: what a torrent actually holds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentContentsView {
    pub kind: String,
    pub seasons: Vec<u32>,
    pub files: Vec<TorrentFileView>,
}

/// `PUT /downloads/{id}/link`: the title an operator pinned the row to.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkBody {
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
}

/// The five naming templates (Sonarr/Radarr-style token strings) plus the
/// global case transform applied to every rendered filename.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamingTemplatesView {
    pub movie_folder: String,
    pub movie_file: String,
    pub series_folder: String,
    pub season_folder: String,
    pub episode_file: String,
    pub case: String,
}

/// `GET /organize/naming` current templates + a rendered sample.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamingView {
    pub templates: NamingTemplatesView,
    pub sample: SampleNames,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleNames {
    pub movie: String,
    pub episode: String,
}

/// `POST /organize/sample` body.
pub type SampleBody = NamingTemplatesView;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeMove {
    pub title: String,
    pub kind: String,
    pub from: String,
    pub to: String,
}

/// `GET /organize/preview`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePlan {
    pub moves: Vec<OrganizeMove>,
    pub total_files: u32,
    pub matching: u32,
}

/// `POST /organize/apply` result.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeResult {
    pub moved: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}
