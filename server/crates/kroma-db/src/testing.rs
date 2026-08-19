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

impl TempPool {
    /// A second pool over the SAME database, scoped to `grant` the way the
    /// supervisor scopes the one it hands a module's process.
    ///
    /// Here rather than in each module's test file: every module that declares
    /// storage wants exactly this pair, and three copies of the open-and-scope
    /// dance is three chances for one of them to test something else.
    pub fn scoped(&self, module_id: &str, grant: &crate::Grant) -> Pool {
        crate::init_scoped(self.pool.path(), module_id, grant).expect("scope test db")
    }

    /// A module-private database beside this one, with no schema in it, as the
    /// runtime opens `<data>/modules/<id>/module.sqlite`.
    pub fn store(&self) -> Pool {
        crate::open(&self._dir.path().join("module.sqlite")).expect("open test store")
    }
}

/// A fresh, migrated, empty database no other test shares. `tag` only shapes
/// the directory name, to make a stray one identifiable.
pub fn temp_pool(tag: &str) -> TempPool {
    let dir = kroma_testing::temp_dir(tag);
    let pool = crate::init(&dir.path().join("kroma.db")).expect("init test db");
    TempPool { pool, _dir: dir }
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
