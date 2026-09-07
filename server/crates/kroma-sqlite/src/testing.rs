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
    dir: TempDir,
}

impl Deref for TempPool {
    type Target = Pool;

    fn deref(&self) -> &Pool {
        &self.pool
    }
}

impl TempPool {
    /// `pool` opened over a file inside `dir`, whose lifetime this now owns.
    pub fn over(pool: Pool, dir: TempDir) -> Self {
        Self { pool, dir }
    }

    /// The pool and the directory it lives in, for a caller that takes over
    /// keeping that directory alive.
    pub fn into_parts(self) -> (Pool, TempDir) {
        (self.pool, self.dir)
    }

    /// A second pool over the SAME database, scoped to `grant` the way the
    /// supervisor scopes the one it hands a module's process.
    pub fn scoped(&self, module_id: &str, grant: &crate::Grant) -> Pool {
        crate::init_scoped(self.pool.path(), module_id, grant).expect("scope test db")
    }

    /// A module-private database beside this one, with no schema in it, as the
    /// runtime opens `<data>/modules/<id>/module.sqlite`.
    pub fn store(&self) -> Pool {
        crate::open(&self.dir.path().join("module.sqlite")).expect("open test store")
    }
}

/// A fresh, empty database no other test shares, with no schema in it: what a
/// module's own `migrations()` run against. `tag` only shapes the directory
/// name, to make a stray one identifiable.
pub fn temp_pool(tag: &str) -> TempPool {
    let dir = kroma_testing::temp_dir(tag);
    let pool = crate::open(&dir.path().join("module.sqlite")).expect("open test db");
    TempPool::over(pool, dir)
}

/// The `storage.core` grant out of a module's own `module.json`, so a test
/// asserts against what the module SHIPS rather than a copy of it.
///
/// A manifest with no `storage` object yields the empty grant, which is the
/// same thing the supervisor hands such a module.
pub fn grant_from_manifest(manifest_json: &str) -> crate::Grant {
    serde_json::from_str::<serde_json::Value>(manifest_json)
        .ok()
        .and_then(|m| serde_json::from_value(m["storage"]["core"].clone()).ok())
        .unwrap_or_default()
}
