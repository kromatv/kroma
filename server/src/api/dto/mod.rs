//! Typed response DTOs for endpoints whose JSON was previously assembled ad-hoc
//! with `serde_json::json!`: a single source of truth the TS clients mirror via
//! zod (`packages/core`). `#[serde(rename_all = "camelCase")]` maps snake_case
//! Rust fields to the camelCase clients expect.

mod admin;
mod auth;
mod pairing;
mod search;

pub use admin::{
    AdminLibrary, AdminOverview, AdminUsers, CacheInfo, Health, HistoryBucket, HistoryStats,
    LlmAdminConfig, LlmProviderView, NotificationImage, NotificationImages, ServerInfo,
    SettingsView, StorageInfo,
};
pub use auth::{
    AuthConfig, AuthResult, InviteCreated, PasskeyInfo, ResetCheck, ResetCreated, SessionInfo,
    SessionResult, VerificationCreated,
};
pub use pairing::{PairingPoll, QuickConnectInit};
pub use search::{PersonDetailResponse, PersonResponse, SearchHit, SearchResponse};
