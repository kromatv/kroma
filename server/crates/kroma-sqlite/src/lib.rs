//! A module's window onto SQLite: the WAL pool, the grant that scopes it to the
//! core tables a manifest declares, and the versioned migrations every database
//! takes, the core's and a module's own. The mechanism and nothing of the schema, so a sidecar links this
//! and never `kroma-db`.

mod grant;
mod migrate;
mod open;
mod pool;
#[cfg(any(test, feature = "testing"))]
pub mod testing;

pub use grant::{init_scoped, Grant};
pub use migrate::{migrate, user_version, Legacy, Migrated, Run, Schema, Step, KEPT_SNAPSHOTS};
pub use open::{apply_migrations, migrate_store, open, open_with};
pub use pool::{Pool, PoolInner, PooledConn};

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
