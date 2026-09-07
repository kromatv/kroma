//! A throwaway core database for one test, behind the `testing` feature.

pub use kroma_sqlite::testing::{grant_from_manifest, TempPool};

/// A fresh, migrated, empty core database no other test shares. `tag` only
/// shapes the directory name, to make a stray one identifiable.
pub fn temp_pool(tag: &str) -> TempPool {
    let dir = kroma_testing::temp_dir(tag);
    let pool = crate::init(&dir.path().join("kroma.db")).expect("init test db");
    TempPool::over(pool, dir)
}
