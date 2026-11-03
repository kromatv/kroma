//! The catalogue sizes `/api/health` reports, held in memory so a probe never
//! waits on the database.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio::time::Instant;

use crate::db::{self, Pool};

const FRESH_FOR: Duration = Duration::from_secs(30);

/// How many libraries, items and shows the catalogue holds.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Counts {
    pub libraries: usize,
    pub items: usize,
    pub shows: usize,
}

#[derive(Clone, Copy)]
struct Snapshot {
    counts: Counts,
    read_at: Instant,
}

/// The last [`Counts`] read, shared by every probe.
#[derive(Default)]
pub struct LibraryCounts {
    held: RwLock<Option<Snapshot>>,
    refreshing: AtomicBool,
}

impl LibraryCounts {
    /// The counts as last read. Only the first call waits on the database; one
    /// past the freshness window answers at once and reads again behind it.
    pub async fn current(self: &Arc<Self>, pool: &Pool) -> anyhow::Result<Counts> {
        match self.snapshot() {
            Some(held) if held.read_at.elapsed() < FRESH_FOR => Ok(held.counts),
            Some(held) => {
                self.refresh_behind(pool);
                Ok(held.counts)
            }
            None => {
                let pool = pool.clone();
                let read = tokio::task::spawn_blocking(move || read(&pool)).await??;
                self.store(read);
                Ok(read)
            }
        }
    }

    fn refresh_behind(self: &Arc<Self>, pool: &Pool) -> Option<JoinHandle<()>> {
        if self.refreshing.swap(true, Ordering::AcqRel) {
            return None;
        }
        let me = Arc::clone(self);
        let pool = pool.clone();
        Some(tokio::task::spawn_blocking(move || {
            match read(&pool) {
                Ok(counts) => me.store(counts),
                Err(e) => {
                    tracing::warn!(target: "library", "re-reading the library counts failed: {e:#}")
                }
            }
            me.refreshing.store(false, Ordering::Release);
        }))
    }

    fn snapshot(&self) -> Option<Snapshot> {
        *self
            .held
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn store(&self, counts: Counts) {
        let snapshot = Snapshot {
            counts,
            read_at: Instant::now(),
        };
        *self
            .held
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(snapshot);
    }
}

fn read(pool: &Pool) -> anyhow::Result<Counts> {
    let (libraries, items, shows) = db::counts(pool)?;
    Ok(Counts {
        libraries,
        items,
        shows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn add_library(pool: &Pool, id: &str) {
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO libraries (id, name, kind, path, added_at) \
                 VALUES (?1, ?1, 'movies', '/media', '2026-01-01')",
                [id],
            )
            .unwrap();
    }

    #[tokio::test]
    async fn the_first_call_reads_the_catalogue() {
        let pool = crate::db::testing::temp_pool("counts-first");
        add_library(&pool, "films");
        let counts = Arc::new(LibraryCounts::default());

        let read = counts.current(&pool).await.unwrap();

        assert_eq!(read.libraries, 1);
    }

    #[tokio::test]
    async fn a_fresh_snapshot_answers_without_reading_again() {
        let pool = crate::db::testing::temp_pool("counts-fresh");
        let counts = Arc::new(LibraryCounts::default());
        counts.current(&pool).await.unwrap();
        add_library(&pool, "films");

        let read = counts.current(&pool).await.unwrap();

        assert_eq!(read.libraries, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn a_stale_snapshot_still_answers_at_once_with_what_it_held() {
        let pool = crate::db::testing::temp_pool("counts-stale");
        let counts = Arc::new(LibraryCounts::default());
        counts.current(&pool).await.unwrap();
        add_library(&pool, "films");
        tokio::time::advance(FRESH_FOR).await;

        let read = counts.current(&pool).await.unwrap();

        assert_eq!(read.libraries, 0);
    }

    #[tokio::test]
    async fn a_refresh_brings_the_snapshot_up_to_date() {
        let pool = crate::db::testing::temp_pool("counts-refresh");
        let counts = Arc::new(LibraryCounts::default());
        counts.current(&pool).await.unwrap();
        add_library(&pool, "films");

        counts.refresh_behind(&pool).unwrap().await.unwrap();

        assert_eq!(counts.current(&pool).await.unwrap().libraries, 1);
    }
}
