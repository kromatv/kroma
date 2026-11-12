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
fn a_running_torrent_with_no_live_peer_is_starving_whatever_it_holds() {
    assert!(status(TorrentState::Downloading, 0.0).is_starving());
    assert!(status(TorrentState::Downloading, 0.3).is_starving());
}

#[test]
fn a_torrent_still_checking_its_files_is_not_starving() {
    assert!(!status(TorrentState::Queued, 0.0).is_starving());
}

#[test]
fn a_paused_torrent_or_one_with_a_live_peer_is_not_starving() {
    let connected = TorrentStatus {
        peers: 1,
        ..status(TorrentState::Downloading, 0.3)
    };

    assert!(!status(TorrentState::Paused, 0.3).is_starving());
    assert!(!connected.is_starving());
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
