use serde::{Deserialize, Serialize};

/// `POST /api/diagnostics/crash` body. Sent by a client whose user opted in to
/// crash reporting; carries a stack trace plus build/device metadata and no
/// other user data. The server clamps every string and stamps `seq`/`receivedAt`
/// itself, so a client cannot forge them or grow the store without bound.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportBody {
    pub message: String,
    #[serde(default)]
    pub stack: String,
    pub platform: String,
    pub captured_at: i64,
    pub build: CrashBuild,
    #[serde(default)]
    pub device: Option<CrashDevice>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashBuild {
    pub version: String,
    #[serde(default)]
    pub commit: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashDevice {
    pub model: String,
    pub os: String,
}

/// A crash report as stored and returned to admins: the clamped client fields
/// plus the server-stamped monotonic `seq` and `receivedAt`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashRecord {
    pub seq: u64,
    pub received_at: i64,
    pub message: String,
    pub stack: String,
    pub platform: String,
    pub captured_at: i64,
    pub build: CrashBuild,
    pub device: Option<CrashDevice>,
}
