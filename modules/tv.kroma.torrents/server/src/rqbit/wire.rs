//! The JSON rqbit 9.1 answers with, read leniently: a field a later release drops
//! defaults rather than failing the call.

use serde::Deserialize;

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Listed {
    pub info_hash: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub stats: Option<Stats>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Stats {
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub progress_bytes: u64,
    #[serde(default)]
    pub uploaded_bytes: u64,
    #[serde(default)]
    pub total_bytes: u64,
    #[serde(default)]
    pub finished: bool,
    #[serde(default)]
    pub live: Option<Live>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Live {
    #[serde(default)]
    pub snapshot: LiveSnapshot,
    #[serde(default)]
    pub download_speed: Speed,
    #[serde(default)]
    pub upload_speed: Speed,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct LiveSnapshot {
    #[serde(default)]
    pub peer_stats: PeerStats,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct PeerStats {
    #[serde(default)]
    pub live: u32,
    #[serde(default)]
    pub seen: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Speed {
    #[serde(default)]
    pub mbps: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Details {
    pub info_hash: String,
    #[serde(default)]
    pub files: Option<Vec<FileDetail>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct FileDetail {
    pub components: Vec<String>,
    #[serde(default)]
    pub length: u64,
}

impl FileDetail {
    pub(super) fn path(&self) -> String {
        self.components.join("/")
    }
}

/// What `POST /torrents` answers.
#[derive(Debug, Clone, Default, Deserialize)]
pub(super) struct Added {
    pub details: Details,
}

#[derive(Deserialize)]
pub(super) struct Rows {
    pub torrents: Vec<Listed>,
}

#[derive(Deserialize)]
pub(super) struct Root {
    pub version: String,
}

#[derive(Deserialize)]
pub(super) struct Refusal {
    pub human_readable: String,
}

#[derive(Deserialize)]
pub(super) struct PeersAdded {
    pub added: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_live_torrent_reads_as_rqbit_9_1_writes_it() {
        let raw = r#"{"id":0,"info_hash":"ab","name":"data","output_folder":"/x","total_pieces":33,
            "stats":{"state":"live","file_progress":[6],"error":null,"progress_bytes":6,"uploaded_bytes":2,
            "total_bytes":12,"finished":false,"live":{"snapshot":{"downloaded_and_checked_bytes":6,
            "peer_stats":{"queued":0,"connecting":0,"live":3,"seen":7,"dead":0,"not_needed":0}},
            "download_speed":{"mbps":2.0,"human_readable":"2.00 MiB/s"},
            "upload_speed":{"mbps":0.5,"human_readable":"0.50 MiB/s"},"time_remaining":null}}}"#;

        let listed: Listed = serde_json::from_str(raw).unwrap();

        let stats = listed.stats.unwrap();
        let live = stats.live.unwrap();
        assert_eq!(stats.state, "live");
        assert_eq!(live.snapshot.peer_stats.live, 3);
        assert_eq!(live.snapshot.peer_stats.seen, 7);
        assert_eq!(live.download_speed.mbps, 2.0);
    }

    #[test]
    fn a_file_is_named_by_its_components_on_every_platform() {
        let file = FileDetail {
            components: vec!["sub".into(), "note.txt".into()],
            length: 6,
        };

        assert_eq!(file.path(), "sub/note.txt");
    }
}
