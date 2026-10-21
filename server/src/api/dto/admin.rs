use serde::Serialize;

use crate::infra::metrics::DiskInfo;
use crate::model::{AdminUser, WatchTotals};
use crate::services::settings::SettingGroup;

/// `GET /api/health`.
#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    // LAN callers only: this endpoint is public, and the household label (e.g.
    // "Salon") should not reach anonymous scanners through the tunnel.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    // Opaque per-install id so a client seen via several origins recognizes the
    // same server; deliberately carries no info about the box.
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    pub version: &'static str,
    #[serde(rename = "updateChannel", skip_serializing_if = "Option::is_none")]
    pub update_channel: Option<crate::services::updates::Channel>,
    pub ffprobe: bool,
    pub libraries: usize,
    pub items: usize,
    pub shows: usize,
}

/// Server identity + uptime for the admin sidebar status card.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub hostname: String,
    pub version: &'static str,
    pub uptime_sec: u64,
    pub online: bool,
    pub sessions: usize,
}

/// Cache directory usage + counts, nested in [`StorageInfo`].
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    pub dir: String,
    pub bytes: u64,
    pub limit: String,
    pub transcode_bytes: u64,
    pub transcode_limit: String,
    pub images_bytes: u64,
    pub images_count: u64,
    pub enriched_items: u64,
    pub enriched_shows: u64,
    pub embeddings: u64,
}

/// `GET /api/admin/storage`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub volumes: Vec<DiskInfo>,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub media_bytes: u64,
    pub cache: CacheInfo,
}

/// `GET /api/admin/users`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUsers {
    pub users: Vec<AdminUser>,
    pub library_count: usize,
}

/// A named, multi-folder library (`GET /api/admin/libraries`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminLibrary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub folders: Vec<String>,
    pub item_count: i64,
    pub size_bytes: i64,
    pub last_scan: Option<String>,
    pub auto_scan: bool,
}

/// One weekly bucket of the play-history chart.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryBucket {
    pub label: String,
    pub films_ms: i64,
    pub tv_ms: i64,
}

/// `GET /api/admin/stats/history`. `bucket_days` is the width chosen from the
/// window, so a client labels the axis with what it actually got.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStats {
    pub buckets: Vec<HistoryBucket>,
    pub total_films_ms: i64,
    pub total_tv_ms: i64,
    pub totals: WatchTotals,
    pub bucket_days: i64,
}

/// `GET /api/admin/stats/overview`.
#[derive(Serialize)]
pub struct AdminOverview {
    pub users: usize,
    pub online: usize,
    pub invites: usize,
    pub items: usize,
    pub shows: usize,
    pub libraries: usize,
}

/// `GET /api/admin/settings?view=…`.
#[derive(Serialize)]
pub struct SettingsView {
    pub view: String,
    pub groups: Vec<SettingGroup>,
}

/// `GET /api/admin/llm` the multi-provider LLM configuration for the IA admin
/// page: the global enable flag, the id of the default provider used for
/// generation, and every configured provider (API keys never returned).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAdminConfig {
    pub enabled: bool,
    pub default_id: String,
    pub providers: Vec<LlmProviderView>,
}

/// One configured provider as shown to the admin the API key itself is never
/// returned, only whether one is set (`has_api_key`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderView {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub has_api_key: bool,
    pub temperature: f32,
    pub max_tokens: i64,
    pub reasoning: bool,
}

/// One image previously uploaded for a notification. `uploadedAt` is epoch
/// milliseconds of the file's mtime, which is what "newest first" sorts by.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationImage {
    pub name: String,
    pub url: String,
    pub uploaded_at: i64,
    pub bytes: u64,
}

/// `GET /api/admin/notifications/images` newest first, capped server-side.
#[derive(Serialize)]
pub struct NotificationImages {
    pub images: Vec<NotificationImage>,
}
