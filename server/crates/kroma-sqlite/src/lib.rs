//! A module's window onto SQLite: the WAL pool, the grant that scopes it to the
//! core tables a manifest declares, and the migrations a module applies to its
//! own file. The mechanism and nothing of the schema, so a sidecar links this
//! and never `kroma-db`.

mod grant;
mod open;
mod pool;
#[cfg(any(test, feature = "testing"))]
pub mod testing;

pub use grant::{init_scoped, Grant};
pub use open::{apply_migrations, open, open_with};
pub use pool::{Pool, PoolInner, PooledConn};

/// The pragmas every pooled connection applies on open.
pub const PRAGMAS: &str = "
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;
    PRAGMA mmap_size = 268435456;
    PRAGMA cache_size = -16000;
    -- ~40 MB checkpoints instead of the 4 MB default: frequent checkpoints
    -- stall readers on HDD during scan/probe bursts.
    PRAGMA wal_autocheckpoint = 10000;
";
