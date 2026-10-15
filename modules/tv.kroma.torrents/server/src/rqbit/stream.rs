use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use librqbit::api::TorrentIdOrHash;

use super::RqbitEngine;
use crate::engine::{PieceLayout, TorrentStream};

impl RqbitEngine {
    /// Narrow a running torrent to `files` alone. Pieces already on disk are
    /// kept, so selecting another file later resumes rather than restarts.
    /// `Ok(false)` where the torrent is not resolved far enough to have a file
    /// list.
    pub(crate) fn select_only_files(&self, client_ref: &str, files: &[usize]) -> Result<bool> {
        if self.find(client_ref)?.metadata.load_full().is_none() {
            return Ok(false);
        }
        let only: HashSet<usize> = files.iter().copied().collect();
        self.handle.block_on(self.select(client_ref, only))?;
        Ok(true)
    }

    /// Open a file of a managed torrent for reading ahead of the download. The
    /// read position steers the piece picker, so a player seeking forward pulls
    /// the pieces it is about to need.
    pub(crate) async fn open_stream(
        &self,
        client_ref: &str,
        file_index: usize,
    ) -> Result<TorrentStream> {
        let (file_name, _) = self
            .resolved_files(client_ref)
            .into_iter()
            .nth(file_index)
            .ok_or_else(|| anyhow!("torrent {client_ref} has no file {file_index} yet"))?;
        let stream = self
            .find(client_ref)?
            .stream(file_index)
            .await
            .with_context(|| format!("open file {file_index} of torrent {client_ref}"))?;
        Ok(TorrentStream {
            len: stream.len(),
            reader: Box::new(stream),
            file_name,
            file: file_index,
            at: 0,
            _playing: None,
        })
    }

    pub(crate) fn file_pieces(&self, client_ref: &str, file_index: usize) -> Result<PieceLayout> {
        let handle = self.find(client_ref)?;
        let metadata = handle
            .metadata
            .load_full()
            .ok_or_else(|| anyhow!("torrent {client_ref} has no metadata yet"))?;
        let file = metadata
            .file_infos
            .get(file_index)
            .ok_or_else(|| anyhow!("torrent {client_ref} has no file {file_index}"))?;
        let piece_len = u64::from(metadata.info.lengths().default_piece_length());
        let file = file.offset_in_torrent..file.offset_in_torrent + file.len;
        let (have, _) = self.api.api_dump_haves(TorrentIdOrHash::Id(handle.id()))?;
        let first_piece = file.start / piece_len;
        let spanned = first_piece..=file.end.saturating_sub(1) / piece_len;
        Ok(PieceLayout {
            have: spanned
                .map(|piece| have.get(piece as usize).is_some_and(|held| *held))
                .collect(),
            first_piece,
            piece_len,
            file,
        })
    }

    /// Where one file of a managed torrent is written. The engine preallocates
    /// the whole length and fills it in, so reading a byte that has not arrived
    /// answers a zero instead of blocking on the swarm: a caller reading this
    /// path directly must ask [`RqbitEngine::file_pieces`] what it may read.
    pub(crate) fn file_on_disk(&self, client_ref: &str, file_index: usize) -> Result<PathBuf> {
        let handle = self.find(client_ref)?;
        let metadata = handle
            .metadata
            .load_full()
            .ok_or_else(|| anyhow!("torrent {client_ref} has no metadata yet"))?;
        let file = metadata
            .file_infos
            .get(file_index)
            .ok_or_else(|| anyhow!("torrent {client_ref} has no file {file_index}"))?;
        let folder = self
            .api
            .api_torrent_details(TorrentIdOrHash::Id(handle.id()))?
            .output_folder;
        Ok(PathBuf::from(folder).join(&file.relative_filename))
    }

    /// Each file of one managed torrent as `(path, size)`, in torrent order, as
    /// the running session already knows them. Empty for a torrent it does not
    /// hold or whose metadata has not resolved. Nothing is fetched from the swarm.
    pub(crate) fn resolved_files(&self, client_ref: &str) -> Vec<(String, u64)> {
        let Some(metadata) = self
            .find(client_ref)
            .ok()
            .and_then(|h| h.metadata.load_full())
        else {
            return Vec::new();
        };
        metadata
            .file_infos
            .iter()
            .map(|file| {
                (
                    file.relative_filename.to_string_lossy().into_owned(),
                    file.len,
                )
            })
            .collect()
    }
}
