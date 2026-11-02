use std::time::Duration;

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::primitives::now_ms;
use rusqlite::params;

const LONGEST_WAIT: Duration = Duration::from_secs(120);

pub(super) struct Pace {
    store: Pool,
    indexer_id: String,
}

impl Pace {
    pub(super) fn new(store: Pool, indexer_id: &str) -> Self {
        Self {
            store,
            indexer_id: indexer_id.to_string(),
        }
    }

    pub(super) fn reserve(&self, delay: Duration) -> Result<Duration> {
        let now = now_ms();
        let delay_ms = i64::try_from(delay.as_millis()).unwrap_or(i64::MAX);
        let conn = self.store.get()?;
        let next_allowed: i64 = conn.query_row(
            "INSERT INTO indexer_pace (id, next_allowed_at) VALUES (?1, ?2 + ?3) \
             ON CONFLICT(id) DO UPDATE SET next_allowed_at = MAX(next_allowed_at, ?2) + ?3 \
             RETURNING next_allowed_at",
            params![self.indexer_id, now, delay_ms],
            |row| row.get(0),
        )?;
        let slot_opens_in = u64::try_from(next_allowed - delay_ms - now).unwrap_or(0);
        Ok(Duration::from_millis(slot_opens_in).min(LONGEST_WAIT))
    }

    pub(super) fn hold_off(&self, wait: Duration) -> Result<()> {
        let until = now_ms() + i64::try_from(wait.as_millis()).unwrap_or(i64::MAX);
        self.store.get()?.execute(
            "INSERT INTO indexer_pace (id, next_allowed_at) VALUES (?1, ?2) \
             ON CONFLICT(id) DO UPDATE SET next_allowed_at = MAX(next_allowed_at, ?2)",
            params![self.indexer_id, until],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::db::testing::TempPool;

    use super::*;
    use crate::db::{MIGRATIONS, STEPS};

    const DELAY: Duration = Duration::from_secs(10);

    fn store() -> TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-pace");
        kroma_module_sdk::db::migrate_store(&pool, crate::MODULE_ID, MIGRATIONS, STEPS).unwrap();
        pool
    }

    fn pace(store: &TempPool, id: &str) -> Pace {
        Pace::new((**store).clone(), id)
    }

    #[test]
    fn the_first_request_to_a_tracker_goes_out_at_once() {
        let store = store();

        let wait = pace(&store, "a").reserve(DELAY).unwrap();

        assert_eq!(wait, Duration::ZERO);
    }

    #[test]
    fn two_instances_asking_one_tracker_take_turns() {
        let store = store();
        let one_instance = pace(&store, "a");
        let another_instance = pace(&store, "a");

        one_instance.reserve(DELAY).unwrap();
        let wait = another_instance.reserve(DELAY).unwrap();

        assert!(wait > DELAY / 2 && wait <= DELAY, "{wait:?}");
    }

    #[test]
    fn a_later_request_queues_behind_the_slots_already_taken() {
        let store = store();
        let instance = pace(&store, "a");

        instance.reserve(DELAY).unwrap();
        instance.reserve(DELAY).unwrap();
        let wait = instance.reserve(DELAY).unwrap();

        assert!(wait > DELAY && wait <= DELAY * 2, "{wait:?}");
    }

    #[test]
    fn one_tracker_does_not_wait_for_another() {
        let store = store();

        pace(&store, "a").reserve(DELAY).unwrap();
        let wait = pace(&store, "b").reserve(DELAY).unwrap();

        assert_eq!(wait, Duration::ZERO);
    }

    #[test]
    fn a_rate_limited_tracker_is_left_alone_by_every_instance() {
        let store = store();

        pace(&store, "a").hold_off(Duration::from_secs(60)).unwrap();
        let wait = pace(&store, "a").reserve(DELAY).unwrap();

        assert!(wait > Duration::from_secs(50), "{wait:?}");
    }

    #[test]
    fn a_hold_off_never_brings_a_later_slot_forward() {
        let store = store();
        let instance = pace(&store, "a");

        instance.hold_off(Duration::from_secs(60)).unwrap();
        instance.hold_off(Duration::from_secs(1)).unwrap();
        let wait = instance.reserve(DELAY).unwrap();

        assert!(wait > Duration::from_secs(50), "{wait:?}");
    }

    #[test]
    fn a_clock_that_jumped_back_cannot_park_a_call_for_long() {
        let store = store();
        let instance = pace(&store, "a");

        instance
            .hold_off(Duration::from_secs(24 * 60 * 60))
            .unwrap();
        let wait = instance.reserve(DELAY).unwrap();

        assert_eq!(wait, LONGEST_WAIT);
    }

    #[test]
    fn a_database_that_is_missing_the_table_is_an_error_rather_than_no_pacing() {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-pace-missing");

        let outcome = Pace::new((*pool).clone(), "a").reserve(DELAY);

        assert!(outcome.is_err());
    }
}
