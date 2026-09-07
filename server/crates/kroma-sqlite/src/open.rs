//! Opening a database: the pool with the pragmas applied, and a module's own
//! migrations on top of it.

use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use rusqlite::Connection;

use crate::{Pool, PoolInner};

/// A pool over `path` with the pragmas applied and NO schema.
///
/// For a database this crate does not own the shape of -- a module's own file,
/// whose tables come from that module's `migrations()`. [`init`] would stamp the
/// whole core schema into it, which is forty tables it will never read.
pub fn open(path: &Path) -> Result<Pool> {
    pool_at(path, 4, None)
}

/// A pool over `path` keeping up to `max_idle` connections warm, for a database
/// whose owner applies its own schema afterwards.
pub fn open_with(path: &Path, max_idle: usize) -> Result<Pool> {
    pool_at(path, max_idle, None)
}

/// The one place a [`Pool`] is built. `scope` is `None` for a database its owner
/// is not scoped against, and the module grant otherwise.
///
/// Opens one connection before returning, so a path that cannot be opened fails
/// here rather than at whatever query happens to run first.
pub(crate) fn pool_at(
    path: &Path,
    max_idle: usize,
    scope: Option<crate::grant::Scope>,
) -> Result<Pool> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).ok();
    }
    let pool = Arc::new(PoolInner {
        path: path.to_path_buf(),
        idle: Mutex::new(Vec::new()),
        max_idle,
        scope,
    });
    let _ = pool.get()?;
    Ok(pool)
}

/// Apply a module's own schema, the SQL its `migrations()` returns. `IF NOT
/// EXISTS` DDL, so it is idempotent across every boot; one batch, so a syntax
/// error surfaces instead of being silently swallowed.
pub fn apply_migrations(conn: &Connection, sql: &str) -> Result<()> {
    conn.execute_batch(sql)
        .context("failed to apply module schema")
}
