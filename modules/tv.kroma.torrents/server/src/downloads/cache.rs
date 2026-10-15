use std::collections::HashSet;

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::host::HostStorage;
use kroma_module_sdk::primitives::now_ms;

use crate::db::{self, DownloadRow};
use crate::watch::Refusal;

use super::DownloadManager;

pub const KEEP_WATCHED_KEY: &str = "watchKeepInLibrary";
pub const CACHE_MINUTES_KEY: &str = "watchCacheMinutes";

const MINUTE_MS: i64 = 60_000;
const DEFAULT_CACHE_MINUTES: i64 = 30;

/// How long a watch download outlives its last reader: 30 minutes unless set,
/// never under one.
pub fn cache_minutes(store: &Pool) -> i64 {
    db::setting_i64(store, CACHE_MINUTES_KEY, DEFAULT_CACHE_MINUTES).max(1)
}

/// Whether a film started to be watched is imported like any other download
/// instead of being erased once nobody is reading it.
pub fn keeps_watched(store: &Pool) -> bool {
    db::setting_bool(store, KEEP_WATCHED_KEY, false)
}

/// The completed rows an import may take: all of them, but a watch download only
/// while the operator keeps watched films in the library.
pub fn importable<S: HostStorage>(host: &S, rows: Vec<DownloadRow>) -> Result<Vec<DownloadRow>> {
    if keeps_watched(host.store()) {
        return Ok(rows);
    }
    let watched = db::ephemeral_ids(&*host.store().get()?)?;
    Ok(rows
        .into_iter()
        .filter(|row| !watched.contains(&row.id))
        .collect())
}

impl DownloadManager {
    pub(super) fn idle_grace_ms(&self) -> i64 {
        cache_minutes(self.store()) * MINUTE_MS
    }

    pub(super) fn ephemeral_ids(&self) -> Result<HashSet<String>> {
        Ok(db::ephemeral_ids(&*self.store().get()?)?)
    }

    /// Erases a watch download and its data. A download a request or an operator
    /// started is never a watch download, and one somebody is reading is refused:
    /// two viewers can be on the same film, so a cancel is never allowed to end
    /// somebody else's.
    pub(crate) fn cancel_watch(&self, id: &str) -> Result<(), Refusal> {
        let held = self.ephemeral_ids().map_err(failed)?;
        db::get_download(&*self.core().get().map_err(failed)?, id)
            .map_err(failed)?
            .ok_or_else(|| Refusal::Unknown("download not found".to_string()))?;
        if !held.contains(id) {
            return Err(Refusal::Busy("not a watch download".to_string()));
        }
        if self.is_playing(id) {
            return Err(Refusal::Busy("download is being played".to_string()));
        }
        self.erase(id, true).map_err(failed)?;
        self.forget_watch(id);
        db::forget_ephemeral(self.store(), id).map_err(failed)
    }

    /// Everything this process remembers of one download, so none of the maps
    /// grows for the life of the module and no token outlives its bytes.
    pub(super) fn forget_watch(&self, id: &str) {
        self.readers.lock().unwrap().remove(id);
        self.revoke_grants(id);
        if let Err(e) = db::forget_watch_starters(self.store(), id) {
            tracing::warn!(id, error = %format!("{e:#}"), "could not clear who started a watch download");
        }
    }

    pub(super) fn evict_idle_watches(&self) {
        if keeps_watched(self.store()) {
            return;
        }
        let (grace, now) = (self.idle_grace_ms(), now_ms());
        for id in self.ephemeral_ids().unwrap_or_default() {
            if let Err(e) = self.evict(&id, grace, now) {
                tracing::warn!(id, error = %format!("{e:#}"), "could not erase a watch download");
            }
        }
    }

    fn evict(&self, id: &str, grace: i64, now: i64) -> Result<()> {
        if db::get_download(&*self.core().get()?, id)?.is_some() {
            if self.track_readers(id).holds(grace, now) {
                return Ok(());
            }
            self.remove(id, true)?;
            tracing::info!(id, "erased a watch download nobody played");
        }
        self.forget_watch(id);
        db::forget_ephemeral(self.store(), id)
    }
}

fn failed(e: impl std::fmt::Display) -> Refusal {
    Refusal::Failed(format!("{e:#}"))
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;

    use super::super::test_support::{added, manager_over};
    use super::*;
    use crate::downloads::Reading;

    fn watching(tag: &str, watched: &[&str]) -> (StubHost, std::sync::Arc<DownloadManager>) {
        let (host, manager) = manager_over(tag, &[added("w1"), added("w2"), added("r1")]);
        for id in watched {
            db::mark_ephemeral(host.store(), id).unwrap();
        }
        (host, manager)
    }

    #[test]
    fn a_watch_download_reaches_the_import_only_while_watched_films_are_kept() {
        let (host, _) = watching("torrents-cache-import", &["w1"]);
        let imported = |host: &StubHost| {
            let rows = importable(host, vec![added("w1"), added("r1")]).unwrap();
            rows.into_iter().map(|row| row.id).collect::<Vec<_>>()
        };

        let by_default = imported(&host);
        db::set_setting(host.store(), KEEP_WATCHED_KEY, "true").unwrap();
        let kept = imported(&host);

        assert_eq!(by_default, ["r1"]);
        assert_eq!(kept, ["w1", "r1"]);
    }

    #[test]
    fn a_watch_download_is_erased_once_nobody_has_played_it_for_the_cache_delay() {
        let (_, manager) = watching("torrents-cache-evict", &["w1"]);
        manager.evict_idle_watches();
        let first_pass = manager.ephemeral_ids().unwrap().len();

        manager
            .track_readers("w1")
            .backdate(manager.idle_grace_ms());
        manager.evict_idle_watches();

        let conn = manager.core().get().unwrap();
        assert_eq!(first_pass, 1);
        assert!(db::get_download(&conn, "w1").unwrap().is_none());
        assert!(db::get_download(&conn, "r1").unwrap().is_some());
        assert!(manager.ephemeral_ids().unwrap().is_empty());
    }

    #[test]
    fn a_watch_download_somebody_is_reading_is_refused_rather_than_erased_under_them() {
        let (_, manager) = watching("torrents-cache-cancel", &["w1", "w2"]);
        let _stream = manager.playing_guard("w2", Reading::ForAViewer);

        let answers = ["w1", "w2", "r1", "gone"].map(|id| refusal_of(manager.cancel_watch(id)));

        assert_eq!(answers, ["cancelled", "busy", "busy", "unknown"]);
        let conn = manager.core().get().unwrap();
        assert!(db::get_download(&conn, "w2").unwrap().is_some());
    }

    #[test]
    fn a_viewer_cancels_a_film_the_module_is_still_probing() {
        let (_, manager) = watching("torrents-cache-cancel-probing", &["w1"]);
        let _probing = manager.playing_guard("w1", Reading::Internally);

        let cancelled = manager.cancel_watch("w1");

        assert!(cancelled.is_ok(), "{:?}", cancelled.err());
    }

    #[test]
    fn erasing_a_watch_download_leaves_no_token_and_no_claim_on_it_behind() {
        let (host, manager) = watching("torrents-cache-forget", &["w1"]);
        db::mark_watch_starter(host.store(), "w1", "ana").unwrap();
        let token = manager.grant_play("w1", 0).unwrap().token;

        manager.cancel_watch("w1").unwrap();

        assert!(!manager.grants_file(&token, "w1", 0));
        assert!(db::watches_started_by(&host.store().get().unwrap(), "ana")
            .unwrap()
            .is_empty());
    }

    fn refusal_of(answer: Result<(), Refusal>) -> &'static str {
        match answer {
            Ok(()) => "cancelled",
            Err(Refusal::Busy(_)) => "busy",
            Err(Refusal::Unknown(_)) => "unknown",
            Err(_) => "failed",
        }
    }
}
