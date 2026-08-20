//! The types this module works in, and reports on the `download-client` point.
//!
//! Its own, not a shared crate's. It answers a point the download module defines,
//! and the two ship on separate tags: what they agree on is the JSON in
//! [`crate::port`], which each side's tests pin.

use std::path::{Path, PathBuf};

/// One configured qBittorrent, as the caller sends it per call. This process is
/// stateless about which of the operator's clients it is serving.
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

/// The info hash out of a magnet URI, when it carries one. qBittorrent's add
/// endpoint answers with no hash, so a magnet's own is the download's ref.
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

/// The cookie jar for one endpoint: keyed by URL and user, so re-pointing a
/// client or changing its account starts a fresh session.
pub fn cookie_jar_path(state_dir: &Path, def: &ClientDef) -> PathBuf {
    let mut tag: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{}|{}", def.url, def.username).bytes() {
        tag ^= u64::from(b);
        tag = tag.wrapping_mul(0x1000_0000_01b3);
    }
    state_dir.join(format!("qbit-{tag:016x}.cookies"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_magnet_yields_its_hash_in_lowercase_hex() {
        let uri = "MAGNET:?XT=URN:BTIH:0123456789ABCDEF0123456789ABCDEF01234567";

        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
    }

    #[test]
    fn a_base32_hash_is_taken_too() {
        let uri = "magnet:?xt=urn:btih:abcdefghijklmnopqrstuvwxyz234567";

        assert_eq!(magnet_info_hash(uri).as_deref(), Some("abcdefghijklmnopqrstuvwxyz234567"));
    }

    #[test]
    fn anything_that_is_not_a_hash_is_none() {
        assert_eq!(magnet_info_hash("magnet:?dn=nothing"), None);
        assert_eq!(magnet_info_hash(""), None);
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:deadbeef"), None);
    }

    // The jar has to follow the account, or a password change would replay a dead
    // session forever.
    #[test]
    fn the_jar_follows_the_url_and_the_account() {
        let dir = Path::new("/state");
        let a = ClientDef { url: "http://nas:8080".into(), username: "ana".into(), ..Default::default() };
        let b = ClientDef { username: "bo".into(), ..a.clone() };
        let c = ClientDef { url: "http://other:8080".into(), ..a.clone() };

        assert_eq!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &a.clone()));
        assert_ne!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &b));
        assert_ne!(cookie_jar_path(dir, &a), cookie_jar_path(dir, &c));
    }
}
