use kroma_module_sdk::primitives::now_ms;

use crate::db::{self, DownloadRow};

use super::DownloadManager;

impl DownloadManager {
    /// Drops the engine torrent and its data but KEEPS the ledger row. A drop a
    /// reader holds back, or one the engine refuses, stays owed in this module's
    /// own database until it runs, so a restart does not lose it.
    pub fn drop_data(&self, row: &DownloadRow) {
        if row.client_ref.is_empty() {
            self.forget_drop(&row.id);
            return;
        }
        match self.drop_now(row) {
            Ok(()) => self.forget_drop(&row.id),
            Err(why) => self.defer_drop(&row.id, why),
        }
    }

    pub(super) fn retry_deferred_drops(&self) {
        for id in self.deferred_drops() {
            match self
                .core()
                .get()
                .and_then(|c| Ok(db::get_download(&c, &id)?))
            {
                Ok(Some(row)) => self.drop_data(&row),
                Ok(None) => self.forget_drop(&id),
                Err(e) => {
                    tracing::warn!(id, error = %format!("{e:#}"), "could not read the ledger for a deferred drop")
                }
            }
        }
    }

    fn drop_now(&self, row: &DownloadRow) -> Result<(), &'static str> {
        if self.held(&row.id, self.idle_grace_ms(), now_ms()) {
            return Err("a reader still holds it");
        }
        let client = self
            .store()
            .get()
            .ok()
            .and_then(|c| db::get_download_client(&c, &row.client_id).ok().flatten())
            .ok_or("the download client is gone")?;
        let engine = self
            .engine_for(&client)
            .map_err(|_| "the engine is not up")?;
        engine
            .remove(&row.client_ref, true)
            .map_err(|_| "the engine refused to remove it")?;
        let _ = db::set_download_ref(self.core(), &row.id, "");
        tracing::info!(release = %row.release_title, "deleted torrent + data after import");
        Ok(())
    }

    fn deferred_drops(&self) -> Vec<String> {
        self.store()
            .get()
            .and_then(|c| Ok(db::deferred_drops(&c)?))
            .unwrap_or_else(|e| {
                tracing::warn!(error = %format!("{e:#}"), "could not read the deferred drops");
                Vec::new()
            })
    }

    fn defer_drop(&self, id: &str, why: &str) {
        match db::defer_drop(self.store(), id) {
            Ok(true) => {
                tracing::info!(id, why, "delete-after-import deferred")
            }
            Ok(false) => tracing::debug!(id, why, "delete-after-import still deferred"),
            Err(e) => {
                tracing::warn!(id, error = %format!("{e:#}"), "could not record a deferred drop")
            }
        }
    }

    fn forget_drop(&self, id: &str) {
        if let Err(e) = db::forget_drop(self.store(), id) {
            tracing::warn!(id, error = %format!("{e:#}"), "could not clear a settled drop");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{added, manager_over, restarted};
    use crate::downloads::Reading;

    #[test]
    fn a_drop_owed_again_every_tick_says_why_only_the_first_time() {
        let (_host, manager) = manager_over("torrents-drops-quiet", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);

        let first = crate::db::defer_drop(manager.store(), "d1").unwrap();
        let again = crate::db::defer_drop(manager.store(), "d1").unwrap();

        assert!(first, "the first time a drop is owed");
        assert!(!again, "and every retry after it");
    }

    #[test]
    fn a_deferred_drop_survives_the_module_restarting_before_the_reader_closed() {
        let (host, manager) = manager_over("torrents-drops-restart", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);
        manager.drop_data(&added("d1"));

        let after_restart = restarted(&host);

        assert_eq!(after_restart.deferred_drops(), ["d1"]);
    }

    #[test]
    fn a_drop_a_reader_holds_is_owed_rather_than_run() {
        let (_host, manager) = manager_over("torrents-drops-held", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);

        manager.drop_data(&added("d1"));

        assert_eq!(manager.deferred_drops(), ["d1"]);
    }

    #[test]
    fn a_drop_the_engine_could_not_take_is_still_owed_once_the_reader_has_gone() {
        let (_host, manager) = manager_over("torrents-drops-engineless", &[added("d1")]);
        let stream = manager.playing_guard("d1", Reading::ForAViewer);
        manager.drop_data(&added("d1"));

        drop(stream);
        manager
            .track_readers("d1")
            .backdate(manager.idle_grace_ms());
        manager.retry_deferred_drops();

        assert_eq!(manager.deferred_drops(), ["d1"]);
    }

    #[test]
    fn a_drop_stops_being_owed_once_the_torrent_has_left_the_engine() {
        let (_host, manager) = manager_over("torrents-drops-settled", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);
        manager.drop_data(&added("d1"));

        crate::db::set_download_ref(manager.core(), "d1", "").unwrap();
        manager.retry_deferred_drops();

        assert!(manager.deferred_drops().is_empty());
    }

    #[test]
    fn a_drop_owed_for_a_row_that_left_the_ledger_is_forgotten() {
        let (_host, manager) = manager_over("torrents-drops-erased", &[added("d1")]);
        let _stream = manager.playing_guard("d1", Reading::ForAViewer);
        manager.drop_data(&added("d1"));

        manager.erase("d1", false).unwrap();
        manager.retry_deferred_drops();

        assert!(manager.deferred_drops().is_empty());
    }
}
