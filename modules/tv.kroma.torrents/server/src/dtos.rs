//! Download wire types: the download queue + client config views, the naming /
//! organize shapes, and the VPN kill-switch status. Pure data (serde); relocated
//! here from the core `kroma-domain` crate so the module that owns them also owns
//! their contract. The acquisition search / grab / analyze DTOs live in the
//! `kroma-acquisition` crate now.

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
    // `rqbit` | `transmission` | `qbittorrent`.
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

/// What an engine is doing right now, as a state a panel can render rather than
/// an error string it has to interpret.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineState {
    Ready,
    /// Warming up: the session is coming back and its torrents are being
    /// restored. Not an error, and not something to retry.
    Starting,
    Stopped,
    /// This build has no embedded engine.
    NotCompiled,
    /// An external daemon, which only answers when asked.
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

/// Create/update body for a download client.
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
    // Live engine stats for an active download (0 when not live/known). Polled
    // into the DTO so the panel shows speed + peers even when the live event
    // stream (WebSocket) can't reach the client - e.g. through a tunnel that
    // doesn't upgrade WebSockets.
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

/// Where one page sits in the filtered ledger.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageView {
    pub page: u32,
    pub per_page: u32,
    /// Rows the CURRENT filter matches, which is what the page count divides.
    pub total: i64,
    pub page_count: u32,
}

/// One sample of the whole engine's throughput, oldest first.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub at_ms: i64,
    pub down_bps: u64,
    pub up_bps: u64,
    pub active: u32,
    pub peers: u32,
}

/// The queue's headline numbers: what is moving now, what has moved ever.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatsView {
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub active: i64,
    /// Every status in the ledger with its row count, so a filter chip can say
    /// how many rows it would reveal without a query per chip.
    pub by_status: std::collections::BTreeMap<String, i64>,
    pub total_downloaded_bytes: u64,
    pub total_uploaded_bytes: u64,
    /// Throughput over the recent past, oldest sample first.
    pub history: Vec<SpeedSample>,
}

/// `GET /downloads`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadsView {
    pub downloads: Vec<DownloadView>,
    // VPN seal status (`None` until a proxy is configured).
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

/// One TMDB title a download could be for, ranked best first.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchCandidateView {
    pub tmdb_id: u64,
    /// `movie` | `show`.
    pub kind: String,
    pub title: String,
    pub year: Option<u32>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    /// 0..1, from the same ranking the automatic pass uses.
    pub score: f64,
}

/// `POST /downloads/torrent`: what an uploaded `.torrent` says about itself,
/// in the shape the manual-add flow already speaks.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectedTorrent {
    /// The magnet that stands for the file, for the engines that take no bytes.
    pub magnet: String,
    pub info_hash: String,
    /// The torrent's own name, which for a scene release is the release name.
    pub release_title: String,
    pub size_bytes: u64,
    /// What the release name reads as: `movie` | `season` | `episode`.
    pub kind: String,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
}

/// One file inside a torrent, with what the release parser read off its name.
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
///
/// The same shape the acquisition module answers its own analysis with, so one
/// component renders a torrent being added and a torrent already in the queue.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentContentsView {
    /// `movie` | `episode` | `season` | `series` | `unknown`.
    pub kind: String,
    pub seasons: Vec<u32>,
    pub files: Vec<TorrentFileView>,
}

/// `PUT /downloads/{id}/link`: the title an operator pinned the row to.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkBody {
    /// `movie` | `season` | `episode`.
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

/// Example rendered names for the live preview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleNames {
    pub movie: String,
    pub episode: String,
}

/// `POST /organize/sample` body (render as the admin types).
pub type SampleBody = NamingTemplatesView;

/// One file the rename tool would move.
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
