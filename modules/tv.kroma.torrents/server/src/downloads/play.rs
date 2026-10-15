use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::primitives::{now_ms, random_token};

use crate::db::{self, DownloadRow};
use crate::engine::{IndexWarm, Selection, TorrentStream};

use super::{DownloadManager, Reading};

const PLAY_GRANT_TTL_MS: i64 = 12 * 60 * 60 * 1000;
// Minted again with this much of the twelve hours left, so a long film never
// runs out of credential mid-play: hls.js would answer a 401 by giving up.
const RENEW_WITHIN_MS: i64 = 6 * 60 * 60 * 1000;

#[derive(Clone)]
pub(crate) struct PlayGrant {
    download_id: String,
    client_ref: String,
    file_index: usize,
    expires_at: i64,
}

impl PlayGrant {
    fn live_at(&self, now: i64) -> bool {
        self.expires_at > now
    }

    fn lasts_past(&self, now: i64) -> bool {
        self.expires_at - now > RENEW_WITHIN_MS
    }
}

pub(crate) struct Granted {
    pub(crate) token: String,
    pub(crate) expires_at: i64,
    pub(crate) index: IndexWarm,
}

impl DownloadManager {
    /// The play token for one file of one download, minted once and handed out
    /// again until it is within six hours of expiring.
    ///
    /// Granting is also what narrows a watch download to that one file and puts
    /// its container index at the head of the queue, and both happen on every
    /// call: a viewer who moves to another episode of a pack has to move the
    /// piece picker with them, whatever token they are already holding.
    pub(crate) fn grant_play(&self, download_id: &str, file_index: usize) -> Result<Granted> {
        // One at a time, so the probe and the ticket that a first open fires
        // together narrow once and read the index once rather than twice.
        let _minting = self.minting.lock().unwrap();
        let row = db::get_download(&*self.core().get()?, download_id)?
            .ok_or_else(|| anyhow!("download not found"))?;
        playable(&row)?;
        let index = self.prepare_to_play(&row, file_index);
        let now = now_ms();
        let (token, expires_at) = match self.live_grant(download_id, file_index, now) {
            Some(held) => held,
            None => self.mint(row, file_index, now),
        };
        Ok(Granted {
            token,
            expires_at,
            index,
        })
    }

    fn live_grant(&self, download_id: &str, file_index: usize, now: i64) -> Option<(String, i64)> {
        self.play_grants
            .lock()
            .unwrap()
            .iter()
            .find(|(_, grant)| {
                grant.download_id == download_id
                    && grant.file_index == file_index
                    && grant.lasts_past(now)
            })
            .map(|(token, grant)| (token.clone(), grant.expires_at))
    }

    /// Every token for `download_id` stops being a credential. Called where the
    /// bytes behind them go away, so a stale token cannot outlive its download.
    pub(super) fn revoke_grants(&self, download_id: &str) {
        self.play_grants
            .lock()
            .unwrap()
            .retain(|_, grant| grant.download_id != download_id);
    }

    fn narrows_to_what_is_watched(&self, row: &DownloadRow) -> bool {
        self.ephemeral_ids().is_ok_and(|ids| ids.contains(&row.id))
    }

    fn prepare_to_play(&self, row: &DownloadRow, file_index: usize) -> IndexWarm {
        let Some(engine) = self.rqbit() else {
            return IndexWarm::none();
        };
        let keeping = self.watched_with_its_subtitles(&row.id, file_index);
        let narrowed = self.narrows_to_what_is_watched(row)
            && match engine.select_only_files(&row.client_ref, &keeping) {
                Ok(narrowed) => {
                    tracing::info!(download = %row.id, files = ?keeping, narrowed, "watch download narrowed to what is being played");
                    narrowed
                }
                Err(e) => {
                    tracing::warn!(download = %row.id, file = file_index, error = %format!("{e:#}"), "could not narrow a watch download to what is being played");
                    false
                }
            };
        let selection = match narrowed {
            true => Selection::HeldEmpty(keeping),
            false => Selection::AsFound,
        };
        engine.warm_index(&row.client_ref, file_index, selection)
    }

    pub(crate) fn play_grant(&self, token: &str) -> Option<PlayGrant> {
        self.grant_at(token, now_ms())
    }

    /// Whether `token` is a live grant for exactly this file of this download,
    /// which is the whole credential the playlist and its segments carry.
    pub(crate) fn grants_file(&self, token: &str, download_id: &str, file_index: usize) -> bool {
        self.play_grant(token)
            .is_some_and(|grant| grant.download_id == download_id && grant.file_index == file_index)
    }

    pub(crate) async fn open_stream(
        &self,
        grant: &PlayGrant,
        reading: Reading,
    ) -> Result<TorrentStream> {
        let engine = self
            .rqbit()
            .ok_or_else(|| anyhow!("embedded engine not running"))?;
        let stream = engine
            .open_stream(&grant.client_ref, grant.file_index)
            .await?;
        Ok(TorrentStream {
            _playing: Some(self.playing_guard(&grant.download_id, reading)),
            ..stream
        })
    }

    fn mint(&self, row: DownloadRow, file_index: usize, now: i64) -> (String, i64) {
        let token = random_token();
        let expires_at = now + PLAY_GRANT_TTL_MS;
        let mut grants = self.play_grants.lock().unwrap();
        grants.retain(|_, grant| grant.expires_at > now);
        grants.insert(
            token.clone(),
            PlayGrant {
                download_id: row.id,
                client_ref: row.client_ref,
                file_index,
                expires_at,
            },
        );
        (token, expires_at)
    }

    pub(super) fn granted_ref(&self, download_id: &str, file_index: usize) -> Option<String> {
        let now = now_ms();
        self.play_grants
            .lock()
            .unwrap()
            .values()
            .find(|grant| {
                grant.download_id == download_id
                    && grant.file_index == file_index
                    && grant.live_at(now)
            })
            .map(|grant| grant.client_ref.clone())
    }

    fn grant_at(&self, token: &str, now: i64) -> Option<PlayGrant> {
        let grants = self.play_grants.lock().unwrap();
        grants
            .get(token)
            .filter(|grant| grant.live_at(now))
            .cloned()
    }
}

fn playable(row: &DownloadRow) -> Result<()> {
    if row.client_id != db::EMBEDDED_CLIENT_ID {
        bail!("only a download on the embedded engine can be played while it downloads");
    }
    if row.client_ref.is_empty() {
        bail!("download is still being added");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
