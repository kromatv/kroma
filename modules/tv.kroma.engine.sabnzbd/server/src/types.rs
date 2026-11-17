//! The types this module works in, and reports on the `download-client` point.
//!
//! Its own, not a shared crate's. It answers a point the download module defines,
//! and the two ship on separate tags: what they agree on is the JSON in
//! [`crate::port`], which each side's tests pin.

/// One configured SABnzbd, as the caller sends it per call.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClientDef {
    pub url: String,
    pub api_key: String,
}

/// An NZB to add.
#[derive(Debug, Clone)]
pub struct AddNzbReq<'a> {
    pub protocol: &'a str,
    pub url: &'a str,
    pub name: &'a str,
    pub label: &'a str,
}

/// What a job is doing, in the vocabulary the caller reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Queued,
    Downloading,
    Paused,
    Processing,
    Completed,
    Failed,
}

/// A point-in-time view of one SABnzbd job.
#[derive(Debug, Clone, PartialEq)]
pub struct JobStatus {
    pub client_ref: String,
    pub name: String,
    pub progress: f64,
    pub state: JobState,
    pub down_bps: u64,
    pub size_bytes: u64,
    pub save_path: Option<String>,
    pub error: Option<String>,
    pub downloaded_bytes: u64,
}

/// The base the API hangs off, whatever the operator typed: a trailing slash, a
/// `/sabnzbd` url base, or a pasted `/api` all name the same server.
pub fn api_base(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    trimmed
        .strip_suffix("/api")
        .unwrap_or(trimmed)
        .trim_end_matches('/')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_trailing_slash_is_dropped() {
        assert_eq!(api_base("http://nas:8080/"), "http://nas:8080");
    }

    #[test]
    fn a_url_base_is_kept() {
        assert_eq!(api_base("http://nas:8080/sabnzbd/"), "http://nas:8080/sabnzbd");
    }

    #[test]
    fn a_pasted_api_path_is_dropped() {
        assert_eq!(api_base(" http://nas:8080/sabnzbd/api "), "http://nas:8080/sabnzbd");
    }
}
