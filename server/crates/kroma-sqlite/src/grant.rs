//! Scoped access to the core database, enforced by SQLite itself.
//!
//! A [`Grant`] carries what the module's `module.json` declares, and
//! [`init_scoped`] hands back a pool whose connections apply it through an
//! `sqlite3_set_authorizer` callback.
//!
//! The authorizer fires for every action while a statement is being PREPARED, so
//! the scope cannot be talked around by building the SQL as a string: an
//! ungranted table fails at `prepare`, before a row is read. It is per-connection,
//! which is what lets one database serve two modules with different scopes.
use std::path::Path;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::Pool;

/// Which core tables and columns a module may reach.
///
/// The wire shape is the `storage.core` object of a `module.json`: a list of
/// `"table"` (whole table) or `"table.column"` (that column only) entries per
/// verb. Anything not listed is denied, which is what makes an empty grant --
/// the default -- a pool that answers nothing. A column entry under `write`
/// covers `UPDATE` of that column only: `INSERT` and `DELETE` touch the whole
/// row, so they need the whole table.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grant {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub write: Vec<String>,
}

impl Grant {
    /// A grant that allows nothing. What a module with no declared `storage.core`
    /// gets, so `core()` is always a pool and the refusal is a named denial at
    /// the call site.
    pub fn none() -> Self {
        Self::default()
    }
}

/// A pool over `path` whose every connection refuses anything `grant` does not
/// cover. `module_id` only names the module in the denial log.
///
/// The database is NOT created or migrated here: the core owns the file and has
/// already done both by the time a module is spawned.
#[cfg(not(target_family = "wasm"))]
pub fn init_scoped(path: &Path, module_id: &str, grant: &Grant) -> Result<Pool> {
    crate::open::scoped_pool_at(
        path,
        4,
        Some(crate::authorizer::Scope::granted(module_id, grant)),
    )
}

/// In a component the host holds the file and applies the grant its manifest
/// declared, so nothing the component says about it counts.
#[cfg(target_family = "wasm")]
pub fn init_scoped(path: &Path, _module_id: &str, _grant: &Grant) -> Result<Pool> {
    crate::open::pool_at(path, 4)
}

/// A pool over a module's own file, for the host that runs statements on its
/// behalf: everything is allowed except what would reach outside that file.
#[cfg(not(target_family = "wasm"))]
pub fn open_guarded(path: &Path, module_id: &str) -> Result<Pool> {
    crate::open::scoped_pool_at(path, 4, Some(crate::authorizer::Scope::own_file(module_id)))
}

