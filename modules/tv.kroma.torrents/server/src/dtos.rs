//! Download wire types: the download queue + client config views, the naming /
//! organize shapes, and the VPN kill-switch status. Pure data (serde); relocated
//! here from the core `kroma-domain` crate so the module that owns them also owns
//! their contract. The acquisition search / grab / analyze DTOs live in the
//! `kroma-acquisition` crate now.

use serde::{Deserialize, Serialize};

use kroma_module_sdk::ports::VpnStatusView;

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
}

/// `GET /downloads`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadsView {
    pub downloads: Vec<DownloadView>,
    // VPN seal status (`None` until a proxy is configured).
    pub vpn: Option<VpnStatusView>,
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
