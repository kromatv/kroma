use anyhow::{anyhow, Result};

use kroma_module_sdk::host::HostCtx;

use crate::db::{self, DownloadClientRow, DownloadRow};

use super::DownloadManager;

impl DownloadManager {
    /// Drops the engine torrent and its data but KEEPS the ledger row.
    pub fn drop_data(&self, _host: &dyn HostCtx, row: &DownloadRow) {
        if row.client_ref.is_empty() {
            return;
        }
        let client = self
            .store()
            .get()
            .ok()
            .and_then(|c| db::get_download_client(&c, &row.client_id).ok().flatten());
        if let Some(client) = client {
            if let Ok(engine) = self.engine_for(&client) {
                if let Err(e) = engine.remove(&row.client_ref, true) {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "delete-after-import: engine remove failed");
                    return;
                }
                // Blank the ref so nothing polls a torrent the engine dropped.
                let _ = db::set_download_ref(self.core(), &row.id, "");
                tracing::info!(release = %row.release_title, "deleted torrent + data after import");
            }
        }
    }

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

    pub fn remove(&self, id: &str, delete_data: bool) -> Result<()> {
        let (row, client) = self.row_and_client(id)?;
        // Best-effort: the ledger must be cleanable even if the engine errors.
        if !row.client_ref.is_empty() {
            if let Ok(engine) = self.engine_for(&client) {
                if let Err(e) = engine.remove(&row.client_ref, delete_data) {
                    tracing::warn!(id, error = %format!("{e:#}"), "engine remove failed");
                }
            }
        }
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
