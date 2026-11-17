use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClientDef {
    pub url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone)]
pub struct AddReq<'a> {
    pub protocol: &'a str,
    pub url: &'a str,
    pub name: &'a str,
    pub label: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Queued,
    Downloading,
    Paused,
    Processing,
    Completed,
    Failed,
}

/// A job as the downloads module reads it: the keys are its `status` shape.
#[derive(Debug, Clone, Serialize)]
pub struct JobStatus {
    pub client_ref: String,
    pub name: String,
    pub info_hash: Option<String>,
    pub progress: f64,
    pub state: JobState,
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub peers_seen: u32,
    pub size_bytes: u64,
    pub save_path: Option<String>,
    pub files: Vec<String>,
    pub error: Option<String>,
    pub lifetime_downloaded_bytes: u64,
    pub lifetime_uploaded_bytes: u64,
}
