//! What the helper holds, asked once for every download a tick looks at, and each
//! torrent's file list, which never changes once known.

use std::collections::HashMap;
use std::sync::PoisonError;
use std::time::{Duration, Instant};

use anyhow::Result;

use super::RqbitEngine;
use super::wire::{FileDetail, Listed};

const SNAPSHOT_FOR: Duration = Duration::from_secs(1);

pub(super) struct Snapshot {
    at: Instant,
    torrents: HashMap<String, Listed>,
}

impl RqbitEngine {
    pub(super) fn listed(&self, client_ref: &str) -> Result<Option<Listed>> {
        let mut held = self.snapshot.lock().unwrap_or_else(PoisonError::into_inner);
        let fresh = held
            .as_ref()
            .is_some_and(|snapshot| snapshot.at.elapsed() < SNAPSHOT_FOR);
        if !fresh {
            let torrents = self.api.list()?;
            *held = Some(Snapshot {
                at: Instant::now(),
                torrents: torrents
                    .into_iter()
                    .map(|torrent| (torrent.info_hash.clone(), torrent))
                    .collect(),
            });
        }
        Ok(held
            .as_ref()
            .and_then(|snapshot| snapshot.torrents.get(client_ref))
            .cloned())
    }

    pub(super) fn forget_snapshot(&self) {
        *self.snapshot.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }

    pub(super) fn files_of(&self, client_ref: &str) -> Result<Vec<String>> {
        if let Some(known) = self
            .files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(client_ref)
        {
            return Ok(known.clone());
        }
        let files: Vec<String> = self
            .api
            .details(client_ref)?
            .files
            .unwrap_or_default()
            .iter()
            .map(FileDetail::path)
            .collect();
        self.files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(client_ref.to_string(), files.clone());
        Ok(files)
    }

    pub(super) fn forget_files(&self, client_ref: &str) {
        self.files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(client_ref);
    }
}
