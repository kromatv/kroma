use serde::Serialize;

#[derive(Serialize)]
pub struct WatchableListView {
    pub entries: Vec<WatchableEntryView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchableEntryView {
    pub id: String,
    pub request_id: Option<String>,
    pub tmdb_id: Option<u64>,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub kind: String,
    pub poster_url: Option<String>,
    pub progress: f64,
    pub status: String,
    pub ephemeral: bool,
    pub files: Vec<WatchableFileView>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchableFileView {
    pub index: usize,
    pub name: String,
    pub size_bytes: u64,
    pub is_video: bool,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

/// How much of one file is on disk: `figures` under the keys this module's
/// capability descriptor declares, `slices` one percentage per slice of the file,
/// and `arriving` which of those slices the swarm is being asked for now.
///
/// The five swarm-named fields beside them are what a client read before a
/// descriptor said what to draw. They are answered through 0.13 and gone in
/// 0.14; see `docs/watch-while-downloading.md`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchProgressView {
    pub progress: f64,
    pub figures: WatchFigures,
    pub slices: Vec<u8>,
    pub arriving: Vec<u64>,
    #[serde(flatten)]
    pub swarm: SwarmRates,
    pub pieces: Vec<u8>,
}

#[derive(Serialize)]
pub struct WatchFigures {
    pub downloaded: f64,
    pub speed: u64,
    pub sources: [u32; 2],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmRates {
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub peers_seen: u32,
}

impl WatchProgressView {
    pub fn new(progress: f64, slices: Vec<u8>, arriving: Vec<u64>, swarm: SwarmRates) -> Self {
        Self {
            progress,
            arriving,
            figures: WatchFigures {
                downloaded: progress,
                speed: swarm.down_bps,
                sources: [swarm.peers, swarm.peers_seen],
            },
            pieces: slices.clone(),
            slices,
            swarm,
        }
    }
}

/// `token` is what a playlist and every segment carry in `?t=`, handed over on
/// its own so no client has to take a mount apart to find it; `url` is the same
/// token already spelled as this file's raw bytes.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketView {
    pub url: String,
    pub token: String,
    pub expires_at: i64,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn progress() -> WatchProgressView {
        WatchProgressView::new(
            0.42,
            vec![100, 37, 0],
            vec![1, 2],
            SwarmRates {
                down_bps: 256_000,
                up_bps: 51_200,
                peers: 4,
                peers_seen: 9,
            },
        )
    }

    #[test]
    fn a_progress_serializes_under_the_keys_the_descriptor_declares() {
        let json = serde_json::to_value(progress()).unwrap();

        assert_eq!(json["progress"], json!(0.42));
        assert_eq!(
            json["figures"],
            json!({ "downloaded": 0.42, "speed": 256_000, "sources": [4, 9] })
        );
        assert_eq!(json["slices"], json!([100, 37, 0]));
        assert_eq!(json["arriving"], json!([1, 2]));
    }

    #[test]
    fn the_swarm_named_fields_a_client_read_before_are_answered_beside_them() {
        let json = serde_json::to_value(progress()).unwrap();

        assert_eq!(
            json!({
                "downBps": json["downBps"],
                "upBps": json["upBps"],
                "peers": json["peers"],
                "peersSeen": json["peersSeen"],
                "pieces": json["pieces"],
            }),
            json!({
                "downBps": 256_000,
                "upBps": 51_200,
                "peers": 4,
                "peersSeen": 9,
                "pieces": [100, 37, 0],
            })
        );
    }

    #[test]
    fn an_entry_serializes_under_the_keys_a_client_reads() {
        let entry = WatchableEntryView {
            id: "22e86113ba9a6db4".into(),
            request_id: Some("abc123".into()),
            tmdb_id: Some(45745),
            title: Some("Sintel".into()),
            year: Some(2010),
            kind: "movie".into(),
            poster_url: None,
            progress: 0.34,
            status: "downloading".into(),
            ephemeral: true,
            files: vec![WatchableFileView {
                index: 5,
                name: "Sintel.mp4".into(),
                size_bytes: 129_241_752,
                is_video: true,
                season: None,
                episode: None,
            }],
        };

        let json = serde_json::to_value(WatchableListView {
            entries: vec![entry],
        })
        .unwrap();

        assert_eq!(
            json,
            json!({
                "entries": [{
                    "id": "22e86113ba9a6db4",
                    "requestId": "abc123",
                    "tmdbId": 45745,
                    "title": "Sintel",
                    "year": 2010,
                    "kind": "movie",
                    "posterUrl": null,
                    "progress": 0.34,
                    "status": "downloading",
                    "ephemeral": true,
                    "files": [{
                        "index": 5,
                        "name": "Sintel.mp4",
                        "sizeBytes": 129_241_752,
                        "isVideo": true,
                        "season": null,
                        "episode": null,
                    }],
                }]
            })
        );
    }
}
