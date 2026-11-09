//! A module's window onto SQLite: the WAL pool, the grant that scopes it to the
//! core tables a manifest declares, and the versioned migrations every database
//! takes, the core's and a module's own. The mechanism and nothing of the schema, so a module links this
//! and never `kroma-db`.

#[cfg(target_family = "wasm")]
extern crate kroma_sqlite_guest as rusqlite;

/// What a component's runtime connects its databases through.
#[cfg(target_family = "wasm")]
pub mod guest {
    pub use kroma_sqlite_guest::types::Value;
    pub use kroma_sqlite_guest::{set_backend, Backend, Failure, Outcome};
}

#[cfg(not(target_family = "wasm"))]
mod authorizer;
mod grant;
mod migrate;
mod open;
#[cfg(not(target_family = "wasm"))]
mod own_file;
#[cfg(not(target_family = "wasm"))]
mod private;
mod pool;
#[cfg(any(test, feature = "testing"))]
pub mod testing;

pub use grant::{init_scoped, Grant};
#[cfg(not(target_family = "wasm"))]
pub use grant::open_guarded;
pub use migrate::{
    migrate, user_version, Change, Legacy, Migrated, Run, Schema, SqlStep, Step, KEPT_SNAPSHOTS,
};
/// Keeps the newest [`KEPT_SNAPSHOTS`] of the copies [`migrate`] made beside a
/// database, and removes the rest.
#[cfg(not(target_family = "wasm"))]
pub use migrate::prune_snapshots;
pub use open::{apply_migrations, migrate_store, migrate_store_sql, open, open_with};
#[cfg(not(target_family = "wasm"))]
pub use own_file::{journal_of, module_databases_dir, open_owned, refuse_unowned, JOURNALS};
pub use pool::{Pool, PoolInner, PooledConn};

pub const MODULE_DATABASES_DIR: &str = "databases";

/// The pragmas every pooled connection applies on open.
pub const PRAGMAS: &str = "
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    -- A write that waits behind a slow commit (a NAS paging to disk holds the
    -- lock for seconds) waits rather than failing the work it was saving.
    PRAGMA busy_timeout = 30000;
    PRAGMA mmap_size = 268435456;
    PRAGMA cache_size = -16000;
    -- ~40 MB checkpoints instead of the 4 MB default: frequent checkpoints
    -- stall readers on HDD during scan/probe bursts.
    PRAGMA wal_autocheckpoint = 10000;
    -- The WAL file shrinks back to this after a checkpoint; without it, it
    -- stays at its high-water mark.
    PRAGMA journal_size_limit = 67108864;
";
