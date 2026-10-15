use std::collections::HashSet;
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};

use crate::db::{self, ServableDownload};
use crate::engine::{PieceLayout, READ_AHEAD_BYTES};
use crate::routes::view::{display_title, Named};
use crate::watch::{SwarmRates, Viewer, WatchProgressView, WatchableEntryView, WatchableFileView};
use crate::RqbitEngine;

use super::DownloadManager;

const LEDGER_DEPTH: usize = 500;

const MIN_BUCKETS: u64 = 10;
const MAX_BUCKETS: u64 = 400;

enum Visible {
    Every,
    Only(HashSet<String>),
}

impl Visible {
    fn holds(&self, download: &str) -> bool {
        match self {
            Self::Every => true,
            Self::Only(ids) => ids.contains(download),
        }
    }
}

pub(crate) enum Offer {
    File,
    NoSuchFile,
    Never,
    NotYet,
}

impl DownloadManager {
    /// Every download the embedded engine can serve bytes for that `viewer` may
    /// watch, newest first, with its video files. One whose metadata has not
    /// resolved has none yet and is left out until it does.
    pub fn watchable(&self, viewer: &Viewer) -> Result<Vec<WatchableEntryView>> {
        let conn = self.core().get()?;
        let rows = db::servable_downloads(&conn, LEDGER_DEPTH)?;
        drop(conn);
        let theirs = self.watches_of(viewer)?;
        let watched = self.ephemeral_ids()?;
        Ok(rows
            .into_iter()
            .filter(|row| theirs.holds(&row.id))
            .filter_map(|row| {
                let files = self.video_files(&row.client_ref);
                (!files.is_empty()).then(|| entry(row, files.to_vec(), &watched))
            })
            .collect())
    }

    /// Whether `viewer` is offered `download` at all. Everything a bearer
    /// carries asks this first, so a member cannot reach a download they never
    /// started by naming its id.
    pub(crate) fn watchable_by(&self, viewer: &Viewer, download: &str) -> Result<bool> {
        if viewer.sees_every_download {
            return Ok(true);
        }
        Ok(db::started_the_watch(
            &*self.store().get()?,
            download,
            &viewer.id,
        )?)
    }

    fn watches_of(&self, viewer: &Viewer) -> Result<Visible> {
        if viewer.sees_every_download {
            return Ok(Visible::Every);
        }
        Ok(Visible::Only(db::watches_started_by(
            &*self.store().get()?,
            &viewer.id,
        )?))
    }

    pub(crate) fn offer(&self, download: &str, file: usize) -> Result<Offer> {
        let Some(row) = db::get_download(&*self.core().get()?, download)? else {
            return Ok(Offer::Never);
        };
        if row.client_id != db::EMBEDDED_CLIENT_ID {
            return Ok(Offer::Never);
        }
        match db::servable(&row.status) {
            db::Servable::Never => return Ok(Offer::Never),
            db::Servable::NotYet => return Ok(Offer::NotYet),
            db::Servable::Now => {}
        }
        if row.client_ref.is_empty() {
            return Ok(Offer::NotYet);
        }
        let files = self.video_files(&row.client_ref);
        if files.is_empty() {
            return Ok(Offer::NotYet);
        }
        Ok(match files.iter().any(|known| known.index == file) {
            true => Offer::File,
            false => Offer::NoSuchFile,
        })
    }

    /// How much of one file is on disk, over `buckets` slices of its bytes
    /// (clamped to 10..=400), with the engine's live rates for the download.
    pub(crate) fn watch_progress(
        &self,
        id: &str,
        file: usize,
        buckets: u64,
    ) -> Result<WatchProgressView> {
        let client_ref = self.watched_ref(id, file)?;
        let engine = self
            .rqbit()
            .ok_or_else(|| anyhow!("embedded engine not running"))?;
        let layout = engine.file_pieces(&client_ref, file)?;
        let status = engine
            .client()
            .status(&client_ref)?
            .ok_or_else(|| anyhow!("download is not in the engine"))?;
        let buckets = buckets.clamp(MIN_BUCKETS, MAX_BUCKETS);
        let (progress, slices) = layout.buckets(buckets);
        let asked = self.asking_for(id, &client_ref, file, layout.len());
        let arriving = layout.slices_touching(&asked, buckets);
        Ok(WatchProgressView::new(
            progress,
            slices,
            arriving,
            SwarmRates {
                down_bps: status.down_bps,
                up_bps: status.up_bps,
                peers: status.peers,
                peers_seen: status.peers_seen,
            },
        ))
    }

    fn asking_for(&self, id: &str, client_ref: &str, file: usize, len: u64) -> Vec<Range<u64>> {
        let Some(engine) = self.rqbit() else {
            return Vec::new();
        };
        let mut asked = engine.asking_for(client_ref, file, len);
        if let Some(at) = self.cursor(id, file) {
            asked.push(at..(at + READ_AHEAD_BYTES).min(len));
        }
        asked
    }

    /// Which of `held` the ledger no longer has a row for, so whoever remembers
    /// something about them can drop it.
    pub fn no_longer_held(&self, held: Vec<String>) -> HashSet<String> {
        let Ok(conn) = self.core().get() else {
            return HashSet::new();
        };
        held.into_iter()
            .filter(|id| matches!(db::get_download(&conn, id), Ok(None)))
            .collect()
    }

    pub(crate) fn file_layout(&self, id: &str, file: usize) -> Result<PieceLayout> {
        let client_ref = self.watched_ref(id, file)?;
        self.rqbit()
            .ok_or_else(|| anyhow!("embedded engine not running"))?
            .file_pieces(&client_ref, file)
    }

    /// Where the engine writes one file, holes and all.
    pub(crate) fn file_on_disk(&self, id: &str, file: usize) -> Result<PathBuf> {
        let client_ref = self.watched_ref(id, file)?;
        self.rqbit()
            .ok_or_else(|| anyhow!("embedded engine not running"))?
            .file_on_disk(&client_ref, file)
    }

    fn watched_ref(&self, id: &str, file: usize) -> Result<String> {
        match self.granted_ref(id, file) {
            Some(granted) => Ok(granted),
            None => Ok(db::get_download(&*self.core().get()?, id)?
                .ok_or_else(|| anyhow!("download not found"))?
                .client_ref),
        }
    }

    pub(super) fn video_files(&self, client_ref: &str) -> Arc<[WatchableFileView]> {
        if let Some(known) = self.video_files.lock().unwrap().get(client_ref) {
            return Arc::clone(known);
        }
        let Some(engine) = self.rqbit() else {
            return Arc::from([]);
        };
        let Some(files) = classify_videos(&engine, client_ref) else {
            return Arc::from([]);
        };
        self.video_files
            .lock()
            .unwrap()
            .insert(client_ref.to_string(), Arc::clone(&files));
        files
    }

    pub(super) fn forget_files(&self, client_ref: &str) {
        self.video_files.lock().unwrap().remove(client_ref);
    }
}

fn classify_videos(engine: &RqbitEngine, client_ref: &str) -> Option<Arc<[WatchableFileView]>> {
    let resolved = engine.resolved_files(client_ref);
    if resolved.is_empty() {
        return None;
    }
    let videos = kroma_scene::classify(&resolved)
        .files
        .into_iter()
        .filter(|file| file.is_video)
        .map(|file| WatchableFileView {
            index: file.index,
            name: file.path,
            size_bytes: file.size_bytes,
            is_video: true,
            season: file.season,
            episode: file.episode,
        })
        .collect();
    Some(videos)
}

fn entry(
    row: ServableDownload,
    files: Vec<WatchableFileView>,
    watched: &HashSet<String>,
) -> WatchableEntryView {
    let title = display_title(Named {
        request_title: row.request_title.as_deref(),
        pinned_title: row.title.as_deref(),
        linked: row.tmdb_id.is_some(),
        release_title: &row.release_title,
    });
    WatchableEntryView {
        ephemeral: watched.contains(&row.id),
        title: Some(title).filter(|title| !title.trim().is_empty()),
        poster_url: row.poster_url,
        id: row.id,
        request_id: row.request_id,
        tmdb_id: row.tmdb_id,
        year: row.year,
        kind: title_kind(&row.kind),
        progress: row.progress,
        status: row.status,
        files,
    }
}

fn title_kind(grabbed_as: &str) -> String {
    match grabbed_as {
        "movie" => "movie",
        _ => "show",
    }
    .to_string()
}

#[cfg(test)]
mod tests;
