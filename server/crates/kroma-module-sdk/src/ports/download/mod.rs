//! The download-ledger contract: the grab spec + stored download row, plus the
//! DownloadGrabPort (grab / gate / activate / drop) and DownloadDbPort (the
//! ledger reads/writes acquisition's import needs), so acquisition doesn't depend
//! on the torrents crate.

use kroma_module_host::HostCtx;

use super::TorrentFileEntry;

mod client;
mod routes;

pub use client::*;
pub use routes::*;

/// Everything needed to grab a torrent + import it. Built from a scored release
/// (auto / interactive) or from admin-provided fields (manual add / magnet).
/// `upgrade` means the grab replaces media already on disk, so the import takes
/// the destination and clears what it superseded instead of landing beside it.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct GrabSpec {
    pub magnet_or_url: String,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub request_id: Option<String>,
    pub wanted_ids: Vec<String>,
    pub only_files: Option<Vec<usize>>,
    pub details_url: Option<String>,
    #[serde(default)]
    pub upgrade: bool,
}

/// A stored download row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DownloadRow {
    pub id: String,
    pub client_id: String,
    pub client_ref: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub info_hash: Option<String>,
    pub magnet_or_url: String,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub status: String,
    pub progress: f64,
    pub save_path: Option<String>,
    // Persisted for the record / a future "reveal in library"; not read yet.
    #[allow(dead_code)]
    pub imported_paths: Option<Vec<String>>,
    pub error: Option<String>,
    pub grabbed_at: i64,
    pub completed_at: Option<i64>,
    pub imported_at: Option<i64>,
    pub details_url: Option<String>,
    pub only_files: Option<Vec<usize>>,
    /// Replaces media already on disk (see [`GrabSpec::upgrade`]).
    #[serde(default)]
    pub upgrade: bool,
}

/// The download manager's grab + lifecycle surface, resolved by acquisition.
pub trait DownloadGrabPort: Send + Sync {
    // Grab a release: record the ledger row and hand it to the engine.
    fn grab(&self, host: &dyn HostCtx, spec: GrabSpec) -> anyhow::Result<DownloadRow>;
    // List a torrent's files (metadata only, no download) so the admin can
    // analyze + select before grabbing.
    fn list_files(
        &self,
        host: &dyn HostCtx,
        magnet_or_url: &str,
    ) -> anyhow::Result<Vec<TorrentFileEntry>>;
    // Whether the kill switch currently allows new grabs.
    fn gate_open(&self) -> bool;
    // Kick a freshly-recorded row into the engine (background add).
    fn activate(&self, host: &dyn HostCtx, row: &DownloadRow);
    // Free a download's data + stop seeding (post-import cleanup).
    fn drop_data(&self, host: &dyn HostCtx, row: &DownloadRow);
}

/// The downloads-ledger reads/writes acquisition's import pass needs.
pub trait DownloadDbPort: Send + Sync {
    fn completed_downloads(&self, host: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>>;
    fn mark_download_imported(
        &self,
        host: &dyn HostCtx,
        id: &str,
        paths: &[String],
        now_ms: i64,
    ) -> anyhow::Result<()>;
    fn set_download_status(
        &self,
        host: &dyn HostCtx,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> anyhow::Result<bool>;
}

/// The contract name for [`DownloadGrabPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const DOWNLOAD_GRAB: &str = "download-grab";

/// The [`DownloadGrabPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn download_grab(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn DownloadGrabPort>> {
    let endpoint = host.port_endpoint(DOWNLOAD_GRAB)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(DownloadGrabClient::new(resolve)))
}

/// The contract name for [`DownloadDbPort`]. A consumer asks the host for THIS, and
/// whichever module declares it in its manifest `ports` answers.
pub const DOWNLOAD_DB: &str = "download-db";

/// The [`DownloadDbPort`] served by whichever module currently provides it, or `None`
/// when none is installed, enabled and running.
pub fn download_db(host: &dyn HostCtx) -> Option<std::sync::Arc<dyn DownloadDbPort>> {
    let endpoint = host.port_endpoint(DOWNLOAD_DB)?;
    let resolve: kroma_module_host::Resolver =
        std::sync::Arc::new(move || Some(endpoint.clone()));
    Some(std::sync::Arc::new(DownloadDbClient::new(resolve)))
}

#[cfg(test)]
pub(super) mod fixtures {
    use super::*;

    pub fn sample_download_row(id: &str) -> DownloadRow {
        DownloadRow {
            id: id.into(),
            client_id: "client".into(),
            client_ref: "hash".into(),
            request_id: None,
            kind: "movie".into(),
            tmdb_id: 1,
            title: Some("Movie".into()),
            year: Some(2020),
            season: None,
            episodes: None,
            release_title: "Movie.2020.1080p".into(),
            indexer_id: None,
            info_hash: Some("hash".into()),
            magnet_or_url: "magnet:?xt=1".into(),
            size_bytes: Some(100),
            score: Some(10),
            score_breakdown: None,
            status: "queued".into(),
            progress: 0.0,
            save_path: None,
            imported_paths: None,
            error: None,
            grabbed_at: 0,
            completed_at: None,
            imported_at: None,
            details_url: None,
            only_files: None,
            upgrade: false,
        }
    }

    #[derive(Default)]
    pub struct StubGrab {
        gate: bool,
        fail: bool,
        pub activated: std::sync::Mutex<Vec<String>>,
        pub dropped: std::sync::Mutex<Vec<String>>,
    }

    impl StubGrab {
        pub fn open() -> Self {
            Self { gate: true, ..Default::default() }
        }
        pub fn closed() -> Self {
            Self::default()
        }
        pub fn failing() -> Self {
            Self { fail: true, ..Default::default() }
        }
    }

    impl DownloadGrabPort for StubGrab {
        fn grab(&self, _h: &dyn HostCtx, _spec: GrabSpec) -> anyhow::Result<DownloadRow> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(sample_download_row("grabbed"))
        }
        fn list_files(
            &self,
            _h: &dyn HostCtx,
            _magnet_or_url: &str,
        ) -> anyhow::Result<Vec<TorrentFileEntry>> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(vec![TorrentFileEntry { index: 0, path: "a.mkv".into(), size_bytes: 10 }])
        }
        fn gate_open(&self) -> bool {
            self.gate
        }
        fn activate(&self, _h: &dyn HostCtx, row: &DownloadRow) {
            self.activated.lock().unwrap().push(row.id.clone());
        }
        fn drop_data(&self, _h: &dyn HostCtx, row: &DownloadRow) {
            self.dropped.lock().unwrap().push(row.id.clone());
        }
    }

    #[derive(Default)]
    pub struct StubDb {
        fail: bool,
    }

    impl StubDb {
        pub fn failing() -> Self {
            Self { fail: true }
        }
    }

    impl DownloadDbPort for StubDb {
        fn completed_downloads(&self, _h: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(vec![sample_download_row("done")])
        }
        fn mark_download_imported(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _paths: &[String],
            _now_ms: i64,
        ) -> anyhow::Result<()> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(())
        }
        fn set_download_status(
            &self,
            _h: &dyn HostCtx,
            _id: &str,
            _status: &str,
            _error: Option<&str>,
        ) -> anyhow::Result<bool> {
            if self.fail {
                anyhow::bail!("boom");
            }
            Ok(true)
        }
    }
}
