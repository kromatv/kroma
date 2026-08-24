use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::domain::RequestStatus;
use kroma_module_sdk::host::{Event, HostCtx};
use kroma_module_sdk::primitives::now_ms;
use serde_json::json;

use crate::db::{self, DownloadClientRow, DownloadRow};
use crate::{AddTorrentReq, DownloadClient};

use super::fetch::fetch_torrent_for;
use super::{DownloadManager, GrabSpec, LABEL};

impl DownloadManager {
    /// Does NO torrent network I/O: the row lands `queued` and the caller runs
    /// [`Self::activate`] in the background to hand it to the engine.
    pub fn grab(&self, host: &dyn HostCtx, spec: GrabSpec) -> Result<DownloadRow> {
        if !self.gate_open() {
            bail!("downloads are held by the VPN kill switch");
        }
        if spec.magnet_or_url.trim().is_empty() {
            bail!("no magnet or download link");
        }
        let conn = self.core().get()?;
        if let Some(existing) = db::active_download_by_url(&conn, spec.magnet_or_url.trim())? {
            bail!(
                "this release is already in the queue (\"{}\", status: {})",
                existing.title.as_deref().unwrap_or(&existing.release_title),
                existing.status
            );
        }
        drop(conn);
        let clients = self.store().get()?;
        let client = db::preferred_download_client(&clients)?
            .ok_or_else(|| anyhow!("no enabled download client"))?;
        drop(clients);

        let id = kroma_module_sdk::primitives::short_hash(&format!(
            "download|{}|{}",
            spec.release_title,
            kroma_module_sdk::primitives::random_token()
        ));
        // External engines use their own directory and report it via status().
        let save_path = (client.kind == "rqbit")
            .then(|| self.downloads_dir.join(&id).to_string_lossy().into_owned());

        let row = DownloadRow {
            id,
            client_id: client.id.clone(),
            client_ref: String::new(), // filled in by activate() once added
            request_id: spec.request_id.clone(),
            kind: spec.kind,
            tmdb_id: spec.tmdb_id,
            title: spec.title,
            year: spec.year,
            season: spec.season,
            episodes: spec.episodes,
            release_title: spec.release_title,
            indexer_id: spec.indexer_id,
            info_hash: None,
            magnet_or_url: spec.magnet_or_url,
            size_bytes: spec.size_bytes,
            score: spec.score,
            score_breakdown: spec.score_breakdown,
            status: "queued".into(),
            progress: 0.0,
            save_path,
            imported_paths: None,
            error: None,
            grabbed_at: now_ms(),
            completed_at: None,
            imported_at: None,
            details_url: spec.details_url,
            only_files: spec.only_files,
            upgrade: spec.upgrade,
        };
        db::insert_download(self.core(), &row)?;
        db::set_wanted_status(self.core(), &spec.wanted_ids, "grabbed", now_ms())?;
        if let Some(req_id) = &row.request_id {
            // Deliberately not persisted: `downloading` is derived at read time
            // from the live download, so it self-heals if the grab fails.
            host.publish(Event::new(
                "request.updated",
                json!({ "id": req_id, "status": RequestStatus::Downloading.as_str() }),
            ));
        }
        tracing::info!(release = %row.release_title, client = %client.name, "queued torrent grab");
        Ok(row)
    }

    /// Background phase of a grab: slow (up to a couple of minutes), and safe
    /// to run detached from the request that queued it.
    pub fn activate(&self, host: &dyn HostCtx, row: &DownloadRow) {
        let client = match self
            .store()
            .get()
            .and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?))
        {
            Ok(Some(c)) => c,
            _ => {
                let _ = db::set_download_status(
                    self.core(),
                    &row.id,
                    "failed",
                    Some("download client unavailable"),
                );
                return;
            }
        };
        let engine = match self.engine_for(&client) {
            Ok(e) => e,
            Err(e) => {
                let _ = db::set_download_status(
                    self.core(),
                    &row.id,
                    "failed",
                    Some(&format!("engine unavailable: {e:#}")),
                );
                return;
            }
        };
        // librqbit routes all its traffic through the VPN proxy and a
        // `0.0.0.0/0` tunnel can't reach a LAN indexer, so its own `.torrent`
        // fetch hangs: fetch it ourselves, direct, and hand over the bytes.
        let prefetched = match self.prefetch_torrent(host, row, &client) {
            Ok(p) => p,
            Err(()) => return,
        };
        let added = engine.add(&AddTorrentReq {
            magnet_or_url: &row.magnet_or_url,
            download_dir: row.save_path.as_deref(),
            label: LABEL,
            only_files: row.only_files.as_deref(),
            torrent_bytes: prefetched.as_deref(),
        });
        match added {
            Ok(client_ref) => self.reconcile_added(row, &*engine, &client_ref),
            Err(e) => {
                let msg = format!("{e:#}");
                tracing::warn!(id = %row.id, release = %row.release_title, error = %msg, "torrent add failed");
                let _ = db::set_download_status(self.core(), &row.id, "failed", Some(&msg));
            }
        }
    }

    fn prefetch_torrent(
        &self,
        host: &dyn HostCtx,
        row: &DownloadRow,
        client: &DownloadClientRow,
    ) -> Result<Option<Vec<u8>>, ()> {
        if client.kind != "rqbit" || !row.magnet_or_url.starts_with("http") {
            return Ok(None);
        }
        match fetch_torrent_for(host, row) {
            Ok(bytes) => {
                tracing::info!(id = %row.id, bytes = bytes.len(), "fetched .torrent directly (bypassing VPN)");
                Ok(Some(bytes))
            }
            Err(e) => {
                let msg = format!("could not fetch .torrent from the indexer: {e:#}");
                tracing::warn!(id = %row.id, error = %msg, "torrent file fetch failed");
                let _ = db::set_download_status(self.core(), &row.id, "failed", Some(&msg));
                Err(())
            }
        }
    }

    fn reconcile_added(&self, row: &DownloadRow, engine: &dyn DownloadClient, client_ref: &str) {
        let current = self
            .core()
            .get()
            .ok()
            .and_then(|c| db::get_download(&c, &row.id).ok().flatten())
            .map(|r| r.status);
        match current.as_deref() {
            None => {
                let _ = engine.remove(client_ref, true);
                tracing::info!(id = %row.id, "torrent add landed after removal; dropped");
            }
            Some("paused") => {
                let _ = engine.pause(client_ref);
                let _ = db::set_download_ref(self.core(), &row.id, client_ref);
                tracing::info!(release = %row.release_title, "torrent added then paused (paused while adding)");
            }
            _ => self.reconcile_dedup(row, client_ref),
        }
    }

    // The engine returns the same ref for identical content from another URL.
    fn reconcile_dedup(&self, row: &DownloadRow, client_ref: &str) {
        let dup = self.core().get().ok().and_then(|c| {
            db::other_active_download_with_ref(&c, &row.id, client_ref)
                .ok()
                .flatten()
        });
        if let Some(other) = dup {
            let name = other.title.as_deref().unwrap_or(&other.release_title);
            let _ = db::set_download_status(
                self.core(),
                &row.id,
                "failed",
                Some(&format!(
                    "duplicate of \"{name}\" (same torrent already downloading)"
                )),
            );
            tracing::info!(id = %row.id, "grab duplicates a live download; marked failed");
            return;
        }
        if let Err(e) = db::activate_download(self.core(), &row.id, client_ref) {
            tracing::warn!(id = %row.id, error = %format!("{e:#}"), "failed to record activated torrent");
        }
        tracing::info!(release = %row.release_title, hash = %client_ref, "torrent added to engine");
    }

    /// Resets the row to `queued`; the caller re-runs [`Self::activate`].
    pub fn retry(&self, id: &str) -> Result<DownloadRow> {
        let (row, client) = self.row_and_client(id)?;
        if !self.gate_open() {
            bail!("downloads are held by the VPN kill switch");
        }
        if !row.client_ref.is_empty() {
            if let Ok(engine) = self.engine_for(&client) {
                let _ = engine.remove(&row.client_ref, false);
            }
        }
        db::reset_download_for_retry(self.core(), id)?;
        let conn = self.core().get()?;
        let row = db::get_download(&conn, id)?.ok_or_else(|| anyhow!("download not found"))?;
        Ok(row)
    }
}
