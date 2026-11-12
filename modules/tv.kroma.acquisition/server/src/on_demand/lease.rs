//! The one on-demand search that may run, as a row every instance of this module
//! sees. It expires, because an instance that dies takes its `Drop` with it, and a
//! live run keeps it by renewing as it goes.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::primitives::now_ms;
use rusqlite::params;

const SEARCH: &str = "on-demand-search";
const LASTS_MS: i64 = 15 * 60 * 1000;

pub(super) fn held(store: &Pool, now: i64) -> Result<bool> {
    let conn = store.get()?;
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM run_leases WHERE name = ?1 AND expires_at > ?2)",
        params![SEARCH, now],
        |r| r.get(0),
    )?)
}

pub(super) fn claim(store: &Pool, now: i64) -> Result<Option<Slot>> {
    let holder = format!("{:016x}", RandomState::new().build_hasher().finish());
    let conn = store.get()?;
    let taken = conn.execute(
        "INSERT INTO run_leases (name, holder, expires_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at \
         WHERE run_leases.expires_at <= ?4",
        params![SEARCH, holder, now + LASTS_MS, now],
    )?;
    Ok((taken == 1).then(|| Slot {
        store: store.clone(),
        holder,
    }))
}

pub(super) struct Slot {
    store: Pool,
    holder: String,
}

impl Slot {
    pub(super) fn renew(&self) {
        self.renew_at(now_ms());
    }

    fn renew_at(&self, now: i64) {
        let renewed = self.store.get().and_then(|conn| {
            conn.execute(
                "UPDATE run_leases SET expires_at = ?1 WHERE name = ?2 AND holder = ?3",
                params![now + LASTS_MS, SEARCH, self.holder],
            )
            .map_err(Into::into)
        });
        if let Err(e) = renewed {
            tracing::warn!(error = %format!("{e:#}"), "could not renew the search lease");
        }
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        let freed = self.store.get().and_then(|conn| {
            conn.execute(
                "DELETE FROM run_leases WHERE name = ?1 AND holder = ?2",
                params![SEARCH, self.holder],
            )
            .map_err(Into::into)
        });
        if let Err(e) = freed {
            tracing::warn!(error = %format!("{e:#}"), "could not free the search lease");
        }
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::db::testing::{temp_pool, TempPool};

    use super::*;

    const NOW: i64 = 1_000_000;

    fn store() -> TempPool {
        let pool = temp_pool("acq-lease");
        crate::rules::schema::install(&pool);
        pool
    }

    #[test]
    fn one_run_holds_the_search_and_ending_frees_it() {
        let store = store();

        let held_by_first = claim(&store, NOW).unwrap().expect("a free search");

        assert!(claim(&store, NOW).unwrap().is_none());
        assert!(held(&store, NOW).unwrap());

        drop(held_by_first);
        assert!(!held(&store, NOW).unwrap());
        assert!(claim(&store, NOW).unwrap().is_some());
    }

    #[test]
    fn a_run_that_died_holding_the_search_loses_it_when_the_lease_runs_out() {
        let store = store();
        std::mem::forget(claim(&store, NOW).unwrap().expect("a free search"));

        assert!(claim(&store, NOW + LASTS_MS - 1).unwrap().is_none());
        assert!(held(&store, NOW + LASTS_MS - 1).unwrap());

        assert!(!held(&store, NOW + LASTS_MS).unwrap());
        assert!(claim(&store, NOW + LASTS_MS).unwrap().is_some());
    }

    #[test]
    fn a_run_that_renews_keeps_the_search_past_its_first_lease() {
        let store = store();
        let run = claim(&store, NOW).unwrap().expect("a free search");

        run.renew_at(NOW + LASTS_MS - 1);

        assert!(claim(&store, NOW + LASTS_MS).unwrap().is_none());
        assert!(held(&store, NOW + LASTS_MS).unwrap());
    }

    #[test]
    fn a_run_that_outlived_its_lease_does_not_free_the_run_that_took_over() {
        let store = store();
        let late = claim(&store, NOW).unwrap().expect("a free search");
        let current = claim(&store, NOW + LASTS_MS).unwrap().expect("expired");

        late.renew_at(NOW + LASTS_MS + 1);
        drop(late);

        assert!(held(&store, NOW + LASTS_MS + 1).unwrap());
        assert!(claim(&store, NOW + LASTS_MS + 1).unwrap().is_none());
        drop(current);
    }
}
