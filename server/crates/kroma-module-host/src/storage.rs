//! The `storage` capability: the two databases a module can be granted, and the
//! helper for running a query off the async runtime.
//!
//! This is deliberately NOT on [`HostCtx`](crate::HostCtx). A pool on the base
//! trait is ambient authority: every sidecar gets unrestricted read/write on the
//! whole core database whether or not it has a single table, and it links the
//! bundled SQLite amalgamation to get it. Behind a capability, a module that
//! declares no storage neither links SQLite nor can reach a row.

use axum::response::Response;
use kroma_db::Pool;

use crate::{blocking, HostCtx};

/// The databases a module holding the `storage` capability can reach.
///
/// The two are not interchangeable. [`store`](Self::store) is the module's own
/// file and it owns it outright; [`db`](Self::db) is the SHARED application
/// database, and every statement prepared on it passes the authorizer built from
/// what the module's `module.json` declares. A module that declared no grant
/// still gets a `db()` pool -- one that denies every table, so the failure is a
/// named denial at the call site rather than a missing method the module could
/// not have compiled against. The core implements both as its own database: it
/// is not scoped against itself.
pub trait HostStorage: HostCtx {
    /// The shared core database, scoped to the module's declared grant.
    fn db(&self) -> &Pool;

    /// The module's private database (`<data>/modules/<id>/module.sqlite`), where
    /// its own `migrations()` are applied. No authorizer: it is the module's file.
    fn store(&self) -> &Pool;
}

impl<T: HostStorage + ?Sized> HostStorage for std::sync::Arc<T> {
    fn db(&self) -> &Pool {
        (**self).db()
    }
    fn store(&self) -> &Pool {
        (**self).store()
    }
}

/// [`blocking`], with the closure handed its own clone of the [`Pool`].
pub async fn query<T, F>(pool: &Pool, f: F) -> Result<T, Response>
where
    F: FnOnce(Pool) -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let pool = pool.clone();
    blocking(move || f(pool)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn query_hands_the_closure_its_own_pool() {
        let pool = kroma_db::testing::temp_pool("host-query");
        let n: Result<i64, Response> = query(&pool, |p| {
            let conn = p.get()?;
            let v: i64 = conn.query_row("SELECT 1 + 1", [], |r| r.get(0))?;
            Ok(v)
        })
        .await;
        assert_eq!(n.unwrap(), 2);
    }

    #[tokio::test]
    async fn the_two_databases_stay_distinct_through_an_arc() {
        let host = std::sync::Arc::new(crate::testing::StubHost::with_db("storage-arc"));
        let via_arc: &dyn HostStorage = &host;
        via_arc
            .store()
            .get()
            .unwrap()
            .execute("CREATE TABLE IF NOT EXISTS mine (id TEXT PRIMARY KEY)", [])
            .unwrap();

        // The private store is the module's own file, so a table created there
        // is not visible in the core database.
        let in_core: i64 = via_arc
            .db()
            .get()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'mine'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            in_core, 0,
            "the private store must not write into the core database"
        );
    }
}
