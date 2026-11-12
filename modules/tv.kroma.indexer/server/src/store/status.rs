use serde::{Deserialize, Serialize};

use super::DefinitionStore;

const RECORD_FILE: &str = ".last-sync.json";
const RETRY_AFTER_MS: i64 = 60 * 1000;

/// What the latest sync of the catalog did, kept beside the definitions so
/// every instance of the module reads the same answer.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyncRecord {
    pub attempted_at_ms: Option<i64>,
    pub synced_at_ms: Option<i64>,
    /// Why the latest attempt failed; `None` once one succeeds, and while one runs.
    pub failure: Option<String>,
}

impl DefinitionStore {
    pub fn record(&self) -> SyncRecord {
        std::fs::read(self.dir.join(RECORD_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn write_record(&self, record: &SyncRecord) {
        let written = serde_json::to_vec(record)
            .map_err(anyhow::Error::from)
            .and_then(|bytes| Ok(std::fs::write(self.dir.join(RECORD_FILE), bytes)?));
        if let Err(error) = written {
            tracing::warn!(%error, "the definition sync was not recorded");
        }
    }

    /// An empty catalog that no sync has tried to fill in the last minute.
    pub fn wants_first_sync(&self, now_ms: i64) -> bool {
        !self.is_populated()
            && self
                .record()
                .attempted_at_ms
                .is_none_or(|at| now_ms - at >= RETRY_AFTER_MS)
    }

    /// Whether this caller should ask for a first sync, counting the ask as an
    /// attempt so the next minute of callers do not ask again.
    pub fn claim_first_sync(&self, now_ms: i64) -> bool {
        if !self.wants_first_sync(now_ms) || std::fs::create_dir_all(&self.dir).is_err() {
            return false;
        }
        self.write_record(&SyncRecord {
            attempted_at_ms: Some(now_ms),
            failure: None,
            ..self.record()
        });
        true
    }
}
