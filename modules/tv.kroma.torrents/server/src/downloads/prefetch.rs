use kroma_module_sdk::host::HostCtx;

use crate::DownloadClient;
use crate::db::{self, DownloadRow};

use super::DownloadManager;
use super::fetch::{NotATorrent, fetch_torrent_for};

#[derive(Default)]
pub(super) struct Prefetched {
    pub(super) torrent: Option<Vec<u8>>,
    pub(super) unfetched: Option<String>,
}

impl Prefetched {
    fn torrent(bytes: Vec<u8>) -> Self {
        Self {
            torrent: Some(bytes),
            unfetched: None,
        }
    }
}

impl DownloadManager {
    pub(super) fn prefetch_torrent(
        &self,
        host: &dyn HostCtx,
        row: &DownloadRow,
        engine: &dyn DownloadClient,
    ) -> Result<Prefetched, ()> {
        if engine.kind() != crate::engine::EMBEDDED_KIND {
            return self.prefetch_for_external(host, row, engine);
        }
        if let Some(bytes) =
            crate::torrent_file::stored_bytes(&self.state_dir, self.uploaded_hash(row).as_deref())
        {
            tracing::info!(id = %row.id, bytes = bytes.len(), "starting from the uploaded .torrent");
            return Ok(Prefetched::torrent(bytes));
        }
        if !row.magnet_or_url.starts_with("http") {
            return Ok(Prefetched::default());
        }
        match fetch_torrent_for(host, row) {
            Ok(bytes) => {
                tracing::info!(id = %row.id, bytes = bytes.len(), "fetched .torrent ahead of the engine");
                Ok(Prefetched::torrent(bytes))
            }
            Err(e) => self.refused(row, &format!("could not fetch .torrent from the indexer: {e:#}")),
        }
    }

    fn prefetch_for_external(
        &self,
        host: &dyn HostCtx,
        row: &DownloadRow,
        engine: &dyn DownloadClient,
    ) -> Result<Prefetched, ()> {
        let fetchable =
            row.protocol == crate::engine::TORRENT && row.magnet_or_url.starts_with("http");
        if !fetchable || !engine.takes_torrent_file() {
            return Ok(Prefetched::default());
        }
        match fetch_torrent_for(host, row) {
            Ok(bytes) => Ok(Prefetched::torrent(bytes)),
            Err(e) if e.is::<NotATorrent>() => {
                self.refused(row, &format!("the release link is not a .torrent: {e:#}"))
            }
            Err(e) => {
                let cause = format!("{e:#}");
                tracing::warn!(id = %row.id, error = %cause, "could not fetch the .torrent; the client gets the link");
                Ok(Prefetched {
                    torrent: None,
                    unfetched: Some(cause),
                })
            }
        }
    }

    fn refused(&self, row: &DownloadRow, msg: &str) -> Result<Prefetched, ()> {
        tracing::warn!(id = %row.id, error = %msg, "no .torrent to hand the engine; download failed");
        let _ = db::set_download_status(self.core(), &row.id, "failed", Some(msg));
        Err(())
    }

    fn uploaded_hash(&self, row: &DownloadRow) -> Option<String> {
        row.info_hash
            .clone()
            .or_else(|| crate::engine::magnet_info_hash(&row.magnet_or_url))
    }
}
