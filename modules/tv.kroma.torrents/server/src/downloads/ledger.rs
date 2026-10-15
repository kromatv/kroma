use anyhow::{anyhow, Result};

use crate::db::{self, DownloadClientRow, DownloadRow};

use super::DownloadManager;

impl DownloadManager {
    /// An empty `client_ref` means the row is still being added: the engine
    /// call is skipped and `activate()` honors the ledger when the add lands.
    pub fn pause(&self, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(id)?;
        if !row.client_ref.is_empty() {
            self.engine_for(&client)?.pause(&row.client_ref)?;
        }
        db::set_download_status(self.core(), id, "paused", None)?;
        Ok(())
    }

    pub fn resume(&self, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(id)?;
        if row.client_ref.is_empty() {
            db::set_download_status(self.core(), id, "queued", None)?;
            return Ok(());
        }
        self.engine_for(&client)?.resume(&row.client_ref)?;
        db::set_download_status(self.core(), id, "downloading", None)?;
        Ok(())
    }

    /// Every file of one download, in torrent order, as the running engine has
    /// already resolved them. Nothing is fetched from the swarm, so an empty
    /// list means the metadata has not arrived yet, and a download an external
    /// daemon holds has none here at all.
    pub fn resolved_files(&self, id: &str) -> Result<Vec<crate::TorrentFileEntry>> {
        let (row, client) = self.row_and_client(id)?;
        if client.kind != crate::engine::EMBEDDED_KIND || row.client_ref.is_empty() {
            return Ok(Vec::new());
        }
        let Some(engine) = self.rqbit() else {
            return Ok(Vec::new());
        };
        Ok(engine
            .resolved_files(&row.client_ref)
            .into_iter()
            .enumerate()
            .map(|(index, (path, size_bytes))| crate::TorrentFileEntry {
                index,
                path,
                size_bytes,
            })
            .collect())
    }

    pub fn remove(&self, id: &str, delete_data: bool) -> Result<()> {
        if delete_data && self.is_playing(id) {
            return Err(anyhow!("download is being played"));
        }
        self.erase(id, delete_data)
    }

    pub(super) fn erase(&self, id: &str, delete_data: bool) -> Result<()> {
        let (row, client) = self.row_and_client(id)?;
        // Best-effort: the ledger must be cleanable even if the engine errors.
        if !row.client_ref.is_empty() {
            if let Ok(engine) = self.engine_for(&client) {
                if let Err(e) = engine.remove(&row.client_ref, delete_data) {
                    tracing::warn!(id, error = %format!("{e:#}"), "engine remove failed");
                }
            }
        }
        self.forget_files(&row.client_ref);
        db::delete_download_row(self.core(), id)?;
        Ok(())
    }

    /// Never touches a foreign torrent in a shared external client.
    pub fn pause_all(&self) -> Result<usize> {
        let rows = {
            let conn = self.core().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.status == "paused" {
                continue;
            }
            match self.pause(&row.id) {
                Ok(()) => n += 1,
                Err(e) => {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "pause_all: skipped a download")
                }
            }
        }
        Ok(n)
    }

    pub fn resume_all(&self) -> Result<usize> {
        let rows = {
            let conn = self.core().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.status != "paused" {
                continue;
            }
            match self.resume(&row.id) {
                Ok(()) => n += 1,
                Err(e) => {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "resume_all: skipped a download")
                }
            }
        }
        Ok(n)
    }

    pub fn reannounce(&self, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(id)?;
        if !row.client_ref.is_empty() {
            self.engine_for(&client)?.reannounce(&row.client_ref)?;
        }
        Ok(())
    }

    pub fn reannounce_all(&self) -> Result<usize> {
        let rows = {
            let conn = self.core().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.client_ref.is_empty() || row.status == "paused" {
                continue;
            }
            match self.reannounce(&row.id) {
                Ok(()) => n += 1,
                Err(e) => {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "reannounce_all: skipped a download")
                }
            }
        }
        Ok(n)
    }

    pub(super) fn row_and_client(&self, id: &str) -> Result<(DownloadRow, DownloadClientRow)> {
        let ledger = self.core().get()?;
        let row = db::get_download(&ledger, id)?.ok_or_else(|| anyhow!("download not found"))?;
        drop(ledger);
        let clients = self.store().get()?;
        let client = db::get_download_client(&clients, &row.client_id)?
            .ok_or_else(|| anyhow!("download client no longer configured"))?;
        Ok((row, client))
    }
}
