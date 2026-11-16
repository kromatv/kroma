use std::collections::HashSet;
use std::sync::Mutex;

use crate::db::{self, DownloadRow};

use super::DownloadManager;

pub(super) struct AddClaim<'a> {
    adding: &'a Mutex<HashSet<String>>,
    id: String,
}

impl Drop for AddClaim<'_> {
    fn drop(&mut self) {
        if let Ok(mut adding) = self.adding.lock() {
            adding.remove(&self.id);
        }
    }
}

impl DownloadManager {
    /// The row as it stands now, held for one add, or `None` when another add
    /// of it is under way or it no longer waits for an engine.
    pub(super) fn claim_add(&self, id: &str) -> Option<(AddClaim<'_>, DownloadRow)> {
        if !self.adding.lock().ok()?.insert(id.to_string()) {
            return None;
        }
        let claim = AddClaim {
            adding: &self.adding,
            id: id.to_string(),
        };
        let conn = self.core().get().ok()?;
        let row = db::get_download(&conn, id).ok().flatten()?;
        (row.status == "queued" && row.never_reached_an_engine()).then_some((claim, row))
    }
}

#[cfg(test)]
mod tests;
