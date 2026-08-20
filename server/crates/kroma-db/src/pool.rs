//! The WAL connection pool.

use std::ops::{Deref, DerefMut};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use rusqlite::Connection;

use super::PRAGMAS;

/// A small, cheap-to-clone WAL connection pool. Cloning shares the same idle
/// connection set (it's an `Arc` inside). Read queries on separate
/// `spawn_blocking` threads each check out their own connection, so WAL readers
/// run concurrently with the single writer.
pub type Pool = Arc<PoolInner>;

pub struct PoolInner {
    pub(crate) path: PathBuf,
    pub(crate) idle: Mutex<Vec<Connection>>,
    pub(crate) max_idle: usize,
    // `None` for the core's own pool: the app is not scoped against itself. A
    // module's pool carries the grant its manifest declared (see [`Grant`]).
    pub(crate) scope: Option<crate::grant::Scope>,
}

impl PoolInner {
    /// The database file this pool opens.
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    fn open(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path).context("open sqlite connection")?;
        conn.execute_batch(PRAGMAS).context("apply pragmas")?;
        // After the pragmas, never before: the authorizer denies PRAGMA, and
        // these are the host's own, not the module's.
        if let Some(scope) = &self.scope {
            scope.install(&conn).context("install storage grant")?;
        }
        Ok(conn)
    }

    /// Check out a connection (reused or freshly opened). Returned to the pool on
    /// drop, up to `max_idle`.
    pub fn get(self: &Arc<Self>) -> Result<PooledConn> {
        let reused = self.idle.lock().unwrap().pop();
        let conn = match reused {
            Some(c) => c,
            None => self.open()?,
        };
        Ok(PooledConn {
            inner: Some(conn),
            pool: Arc::clone(self),
        })
    }
}

/// RAII connection handle; derefs to [`rusqlite::Connection`].
pub struct PooledConn {
    inner: Option<Connection>,
    pool: Pool,
}

impl Deref for PooledConn {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.inner.as_ref().expect("connection present")
    }
}

impl DerefMut for PooledConn {
    fn deref_mut(&mut self) -> &mut Connection {
        self.inner.as_mut().expect("connection present")
    }
}

impl Drop for PooledConn {
    fn drop(&mut self) {
        if let Some(conn) = self.inner.take() {
            let mut idle = self.pool.idle.lock().unwrap();
            if idle.len() < self.pool.max_idle {
                idle.push(conn);
            }
        }
    }
}

#[cfg(test)]
mod pool_tests {
    #[test]
    fn a_returned_connection_is_reused_and_the_idle_set_stays_capped() {
        let pool = crate::testing::temp_pool("pool-cap");
        let max_idle = pool.max_idle;

        {
            let first = pool.get().unwrap();
            first.query_row("SELECT 1", [], |r| r.get::<_, i64>(0)).unwrap();
        }
        assert_eq!(pool.idle.lock().unwrap().len(), 1, "a dropped connection goes back");

        let checked_out: Vec<_> = (0..max_idle + 3).map(|_| pool.get().unwrap()).collect();
        assert!(pool.idle.lock().unwrap().is_empty());
        drop(checked_out);
        assert_eq!(
            pool.idle.lock().unwrap().len(),
            max_idle,
            "connections past the cap are closed, not hoarded"
        );
    }
}
