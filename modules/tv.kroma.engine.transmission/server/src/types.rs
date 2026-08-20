//! The types this module works in, and reports on the `download-client` point.
//!
//! Its own, not a shared crate's. It answers a point the download module defines,
//! and the two ship on separate tags: what they agree on is the JSON in
//! [`crate::port`], which each side's tests pin.

/// One configured Transmission daemon, as the caller sends it per call. This
/// process is stateless about which of the operator's clients it is serving.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClientDef {
    pub kind: String,
    pub url: String,
    pub username: String,
    pub password: String,
}

/// A torrent to add.
#[derive(Debug, Clone)]
pub struct AddTorrentReq<'a> {
    pub magnet_or_url: &'a str,
    pub download_dir: Option<&'a str>,
    pub label: &'a str,
    pub only_files: Option<&'a [usize]>,
    pub torrent_bytes: Option<&'a [u8]>,
}

/// What a torrent is doing, in the vocabulary the caller reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TorrentState {
    Queued,
    Downloading,
    Seeding,
    Paused,
    Completed,
    Error,
}

/// A point-in-time view of one torrent.
#[derive(Debug, Clone)]
pub struct TorrentStatus {
    pub client_ref: String,
    pub name: String,
    pub info_hash: Option<String>,
    pub progress: f64,
    pub state: TorrentState,
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    /// Seen from tracker or DHT, connected or not. While downloading, 0 means a
    /// dead torrent or a blocked announce; above 0 with `peers` at 0 means a
    /// firewall or a proxy.
    pub peers_seen: u32,
    pub size_bytes: u64,
    pub save_path: Option<String>,
    pub files: Vec<String>,
    pub error: Option<String>,
}
