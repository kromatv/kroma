//! What this module needs of a download client, and how it reaches one.

pub mod remote;

use std::collections::BTreeMap;

pub const EMBEDDED_KIND: &str = "rqbit";

/// The protocol of a download a magnet or a `.torrent` starts, and of any grab
/// that names none.
pub const TORRENT: &str = "torrent";

/// `protocol` with the empty name read as [`TORRENT`], the only one there was
/// before grabs named theirs.
pub fn protocol_or_torrent(protocol: &str) -> &str {
    match protocol.trim() {
        "" => TORRENT,
        named => named,
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct AddTorrentReq<'a> {
    pub magnet_or_url: &'a str,
    pub protocol: &'a str,
    pub name: &'a str,
    pub download_dir: Option<&'a str>,
    pub label: &'a str,
    pub only_files: Option<&'a [usize]>,
    pub torrent_bytes: Option<&'a [u8]>,
}

/// What a download is doing. `Processing` is a transfer that is over while the
/// client still verifies, repairs, unpacks or moves it: nothing is imported yet.
/// `Failed` is a client that gave up and will not retry; `Error` may recover, and
/// is also what a state this module has not heard of reads as.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TorrentState {
    Queued,
    Downloading,
    Seeding,
    Paused,
    Processing,
    Completed,
    Failed,
    #[serde(other)]
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentStatus {
    pub client_ref: String,
    pub name: String,
    pub info_hash: Option<String>,
    pub progress: f64,
    pub state: TorrentState,
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub peers_seen: u32,
    pub size_bytes: u64,
    pub save_path: Option<String>,
    pub files: Vec<String>,
    pub error: Option<String>,
    // An engine module ships on its own tag, so a peer still on the pre-rename
    // keys, or on one older than the fields, reaches this module every day.
    #[serde(default, alias = "downloaded_bytes")]
    pub lifetime_downloaded_bytes: u64,
    #[serde(default, alias = "uploaded_bytes")]
    pub lifetime_uploaded_bytes: u64,
}

impl TorrentStatus {
    /// Running with no live peer, whatever it already holds. A torrent still
    /// checking its files on disk is queued, not running.
    pub fn is_starving(&self) -> bool {
        self.state == TorrentState::Downloading && self.peers == 0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentFileEntry {
    pub index: usize,
    pub path: String,
    pub size_bytes: u64,
}

pub trait DownloadClient: Send + Sync {
    fn kind(&self) -> &'static str;
    // Reachability probe; returns a human-readable version string.
    fn test(&self) -> anyhow::Result<String>;
    // Returns the engine's identifier for the new torrent (`client_ref`).
    fn add(&self, req: &AddTorrentReq) -> anyhow::Result<String>;
    // Metadata-only, no download. `torrent_bytes` are the pre-fetched
    // `.torrent` file; when `None` the engine resolves `magnet_or_url` itself.
    // Not every engine can do this (external clients don't expose a list-only
    // add) - the default reports it as unsupported.
    fn list_files(
        &self,
        _magnet_or_url: &str,
        _torrent_bytes: Option<&[u8]>,
    ) -> anyhow::Result<Vec<TorrentFileEntry>> {
        anyhow::bail!("this download client cannot list a torrent's files before adding it")
    }
    fn protocols(&self) -> Vec<String> {
        vec![TORRENT.to_string()]
    }
    // `Ok(None)` = the engine no longer knows this torrent.
    fn status(&self, client_ref: &str) -> anyhow::Result<Option<TorrentStatus>>;
    fn pause(&self, client_ref: &str) -> anyhow::Result<()>;
    fn resume(&self, client_ref: &str) -> anyhow::Result<()>;
    // Force a tracker / DHT re-announce now. Best-effort; the default is a
    // no-op.
    fn reannounce(&self, _client_ref: &str) -> anyhow::Result<()> {
        Ok(())
    }
    fn remove(&self, client_ref: &str, delete_data: bool) -> anyhow::Result<()>;
}

/// One configured client, as an engine is sent it with every call. `settings`
/// holds the add-form fields its engine declares beyond the URL and the
/// credentials, by key.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ClientDef {
    pub kind: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub settings: BTreeMap<String, String>,
}

pub fn magnet_info_hash(uri: &str) -> Option<String> {
    let lower = uri.to_ascii_lowercase();
    let idx = lower.find("xt=urn:btih:")?;
    let hash: String = lower[idx + "xt=urn:btih:".len()..]
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    // 40-char hex (v1) or 32-char base32.
    (hash.len() == 40 || hash.len() == 32).then_some(hash)
}

const LINK_SCHEMES: [&str; 3] = ["magnet:", "http://", "https://"];

/// Whether `link` is one an engine is handed: a magnet or a web URL, by scheme.
pub fn is_download_link(link: &str) -> bool {
    LINK_SCHEMES.iter().any(|scheme| {
        link.get(..scheme.len())
            .is_some_and(|start| start.eq_ignore_ascii_case(scheme))
    })
}

#[cfg(test)]
mod tests;
