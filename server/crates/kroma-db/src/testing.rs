//! A throwaway database for one test, behind the `testing` feature.

use std::ops::Deref;

use kroma_testing::TempDir;

use crate::Pool;

/// A [`Pool`] over a database in a scratch directory of its own.
///
/// Derefs to the pool, so it passes anywhere a `&Pool` is wanted. Dropping it
/// takes the database (and SQLite's `-wal` / `-shm` siblings) with it, so hold
/// it for as long as the pool is used.
pub struct TempPool {
    pool: Pool,
    _dir: TempDir,
}

impl Deref for TempPool {
    type Target = Pool;

    fn deref(&self) -> &Pool {
        &self.pool
    }
}

/// A fresh, migrated, empty database no other test shares. `tag` only shapes
/// the directory name, to make a stray one identifiable.
pub fn temp_pool(tag: &str) -> TempPool {
    let dir = kroma_testing::temp_dir(tag);
    let pool = crate::init(&dir.path().join("kroma.db")).expect("init test db");
    TempPool { pool, _dir: dir }
}
