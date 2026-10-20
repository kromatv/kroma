//! What this module needs of a torrent engine, and how it reaches one.

pub mod remote;

pub const EMBEDDED_KIND: &str = "rqbit";

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct AddTorrentReq<'a> {
    pub magnet_or_url: &'a str,
    pub download_dir: Option<&'a str>,
    pub label: &'a str,
    pub only_files: Option<&'a [usize]>,
    pub torrent_bytes: Option<&'a [u8]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TorrentState {
    Queued,
    Downloading,
    Seeding,
    Paused,
    Completed,
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
    /// Running, with nothing downloaded and no peer ever seen. A torrent still
    /// checking its files on disk reports the same zeros and is not stalled.
    pub fn is_stalled_at_start(&self) -> bool {
        self.state == TorrentState::Downloading
            && self.progress <= 0.0
            && self.peers == 0
            && self.peers_seen == 0
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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ClientDef {
    pub kind: String,
    pub url: String,
    pub username: String,
    pub password: String,
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

#[cfg(test)]
mod tests {
    use super::*;

    struct Stub;
    impl DownloadClient for Stub {
        fn kind(&self) -> &'static str {
            "stub"
        }
        fn test(&self) -> anyhow::Result<String> {
            Ok("v1".into())
        }
        fn add(&self, _req: &AddTorrentReq) -> anyhow::Result<String> {
            Ok("ref".into())
        }
        fn status(&self, _client_ref: &str) -> anyhow::Result<Option<TorrentStatus>> {
            Ok(None)
        }
        fn pause(&self, _client_ref: &str) -> anyhow::Result<()> {
            Ok(())
        }
        fn resume(&self, _client_ref: &str) -> anyhow::Result<()> {
            Ok(())
        }
        fn remove(&self, _client_ref: &str, _delete_data: bool) -> anyhow::Result<()> {
            Ok(())
        }
    }

    fn status(state: TorrentState, progress: f64) -> TorrentStatus {
        TorrentStatus {
            client_ref: "ref".into(),
            name: "n".into(),
            info_hash: None,
            progress,
            state,
            down_bps: 0,
            up_bps: 0,
            peers: 0,
            peers_seen: 0,
            size_bytes: 0,
            save_path: None,
            files: Vec::new(),
            error: None,
            lifetime_downloaded_bytes: 0,
            lifetime_uploaded_bytes: 0,
        }
    }

    #[test]
    fn a_running_torrent_with_nothing_and_no_peer_is_stalled() {
        assert!(status(TorrentState::Downloading, 0.0).is_stalled_at_start());
    }

    #[test]
    fn a_torrent_still_checking_its_files_is_not_stalled() {
        assert!(!status(TorrentState::Queued, 0.0).is_stalled_at_start());
    }

    #[test]
    fn a_paused_or_started_torrent_is_not_stalled() {
        assert!(!status(TorrentState::Paused, 0.0).is_stalled_at_start());
        assert!(!status(TorrentState::Downloading, 0.1).is_stalled_at_start());
    }

    #[test]
    fn magnet_info_hash_v1_hex() {
        let uri = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=movie";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
    }

    #[test]
    fn magnet_info_hash_is_case_insensitive() {
        let uri = "MAGNET:?XT=URN:BTIH:0123456789ABCDEF0123456789ABCDEF01234567";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
    }

    #[test]
    fn magnet_info_hash_base32_len_32() {
        let uri = "magnet:?xt=urn:btih:abcdefghijklmnopqrstuvwxyz234567";
        assert_eq!(
            magnet_info_hash(uri).as_deref(),
            Some("abcdefghijklmnopqrstuvwxyz234567")
        );
    }

    #[test]
    fn magnet_info_hash_rejects_bad_input() {
        assert_eq!(magnet_info_hash("magnet:?dn=nothing"), None);
        assert_eq!(magnet_info_hash(""), None);
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:deadbeef"), None);
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:-&dn=x"), None);
    }

    #[test]
    fn an_engine_answers_the_whole_client_contract() {
        let engine: Box<dyn DownloadClient> = Box::new(Stub);

        assert_eq!(engine.kind(), "stub");
        assert_eq!(engine.test().unwrap(), "v1");
        let req = AddTorrentReq {
            magnet_or_url: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
            download_dir: Some("/downloads"),
            label: "kroma",
            only_files: Some(&[0, 2]),
            torrent_bytes: None,
        };
        assert_eq!(engine.add(&req).unwrap(), "ref");
        assert!(
            engine.status("ref").unwrap().is_none(),
            "a forgotten torrent is None, not an error"
        );
        engine.pause("ref").unwrap();
        engine.resume("ref").unwrap();
        engine.remove("ref", true).unwrap();
    }

    #[test]
    fn default_trait_methods_on_engine() {
        assert!(Stub.list_files("magnet:?x", None).is_err());
        assert!(Stub.reannounce("ref").is_ok());
    }

    #[test]
    fn an_engine_still_on_the_pre_rename_keys_is_read_at_its_word() {
        let older = serde_json::json!({
            "client_ref": "abc",
            "name": "The.Matrix",
            "info_hash": null,
            "progress": 1.0,
            "state": "seeding",
            "down_bps": 0,
            "up_bps": 0,
            "peers": 0,
            "peers_seen": 0,
            "size_bytes": 0,
            "save_path": null,
            "files": [],
            "error": null,
            "downloaded_bytes": 4096,
            "uploaded_bytes": 8192,
        });

        let status: TorrentStatus = serde_json::from_value(older).unwrap();

        assert_eq!(status.lifetime_downloaded_bytes, 4096);
        assert_eq!(status.lifetime_uploaded_bytes, 8192);
    }

    #[test]
    fn torrent_state_serde_is_lowercase() {
        assert_eq!(
            serde_json::to_string(&TorrentState::Downloading).unwrap(),
            "\"downloading\""
        );
        assert_eq!(
            serde_json::to_string(&TorrentState::Queued).unwrap(),
            "\"queued\""
        );
        let s: TorrentState = serde_json::from_str("\"seeding\"").unwrap();
        assert_eq!(s, TorrentState::Seeding);
    }

    #[test]
    fn torrent_file_entry_round_trips() {
        let e = TorrentFileEntry {
            index: 3,
            path: "a/b.mkv".into(),
            size_bytes: 42,
        };
        let json = serde_json::to_string(&e).unwrap();
        let back: TorrentFileEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(back.index, 3);
        assert_eq!(back.path, "a/b.mkv");
        assert_eq!(back.size_bytes, 42);
    }
}
