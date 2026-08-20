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
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Arc;

use anyhow::Result;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::Pool;

/// Reading a table's schema is not reading its data, and denying it breaks
/// `PRAGMA table_info` and rusqlite's own column lookups for statements that are
/// otherwise allowed.
const SCHEMA_TABLES: [&str; 3] = ["sqlite_master", "sqlite_schema", "sqlite_temp_master"];

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

    /// Compile the declared entries into the lookup the authorizer runs per
    /// action. Unparseable entries are dropped rather than failing the module:
    /// a typo in a manifest costs that one grant, loudly, not the whole boot.
    fn compile(&self) -> Compiled {
        Compiled { read: columns_by_table(&self.read), write: columns_by_table(&self.write) }
    }
}

// `None` as the column set means the whole table.
type Tables = BTreeMap<String, Option<BTreeSet<String>>>;

struct Compiled {
    read: Tables,
    write: Tables,
}

fn columns_by_table(entries: &[String]) -> Tables {
    let mut out: Tables = BTreeMap::new();
    for entry in entries {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        match entry.split_once('.') {
            None => {
                out.insert(entry.to_ascii_lowercase(), None);
            }
            Some((table, column)) => {
                let slot = out.entry(table.trim().to_ascii_lowercase()).or_insert_with(|| {
                    Some(BTreeSet::new())
                });
                // A whole-table entry beside a column entry keeps the wider one.
                if let Some(cols) = slot {
                    cols.insert(column.trim().to_ascii_lowercase());
                }
            }
        }
    }
    out
}

fn allows(tables: &Tables, table: &str, column: &str) -> bool {
    match tables.get(&table.to_ascii_lowercase()) {
        None => false,
        Some(None) => true,
        // SQLite passes an empty column for a table-level touch (`count(*)`).
        Some(Some(cols)) => column.is_empty() || cols.contains(&column.to_ascii_lowercase()),
    }
}

// INSERT writes every column of a row and DELETE removes every column of one,
// so neither is expressible as a column grant: they need the whole table.
fn allows_whole_table(tables: &Tables, table: &str) -> bool {
    matches!(tables.get(&table.to_ascii_lowercase()), Some(None))
}

/// Where a denial happened, for the log line. A bare `SQLITE_AUTH` says only
/// "not authorized", which is unhelpful three layers down a module's data access.
fn describe(action: &AuthAction<'_>) -> String {
    match action {
        AuthAction::Read { table_name, column_name } => format!("read {table_name}.{column_name}"),
        AuthAction::Insert { table_name } => format!("insert into {table_name}"),
        AuthAction::Update { table_name, column_name } => {
            format!("update {table_name}.{column_name}")
        }
        AuthAction::Delete { table_name } => format!("delete from {table_name}"),
        AuthAction::Attach { filename } => format!("attach {filename}"),
        AuthAction::Pragma { pragma_name, .. } => format!("pragma {pragma_name}"),
        other => format!("{other:?}"),
    }
}

fn decide(module_id: &str, grant: &Compiled, ctx: &AuthContext<'_>) -> Authorization {
    let allow = match &ctx.action {
        // The umbrella actions a legal statement always raises. They carry no
        // table, so the per-table checks below are what actually gate the data.
        AuthAction::Select
        | AuthAction::Function { .. }
        | AuthAction::Transaction { .. }
        | AuthAction::Savepoint { .. } => true,

        AuthAction::Read { table_name, column_name } => {
            SCHEMA_TABLES.contains(table_name) || allows(&grant.read, table_name, column_name)
        }
        AuthAction::Insert { table_name } => allows_whole_table(&grant.write, table_name),
        AuthAction::Delete { table_name } => allows_whole_table(&grant.write, table_name),
        AuthAction::Update { table_name, column_name } => {
            allows(&grant.write, table_name, column_name)
        }

        // Everything else -- DDL, ATTACH, PRAGMA, extension loading, REINDEX --
        // is denied outright. A module's own schema belongs in its own file, and
        // ATTACH would otherwise re-open the core database under a name the
        // per-table rules above never see.
        _ => false,
    };
    if allow {
        Authorization::Allow
    } else {
        tracing::warn!(
            module = %module_id,
            denied = %describe(&ctx.action),
            "module storage grant does not cover this statement"
        );
        Authorization::Deny
    }
}

/// A pool over `path` whose every connection refuses anything `grant` does not
/// cover. `module_id` only names the module in the denial log.
///
/// The database is NOT created or migrated here: the core owns the file and has
/// already done both by the time a module is spawned.
pub fn init_scoped(path: &Path, module_id: &str, grant: &Grant) -> Result<Pool> {
    let scope = Scope { module_id: module_id.to_string(), grant: Arc::new(grant.compile()) };
    crate::schema::pool_at(path, 4, Some(scope))
}

/// The authorizer a scoped [`Pool`] installs on each connection it opens.
pub(crate) struct Scope {
    module_id: String,
    grant: Arc<Compiled>,
}

impl Scope {
    pub(crate) fn install(&self, conn: &Connection) -> Result<()> {
        let (module_id, grant) = (self.module_id.clone(), Arc::clone(&self.grant));
        conn.authorizer(Some(move |ctx: AuthContext<'_>| decide(&module_id, &grant, &ctx)))?;
        Ok(())
    }
}

#[cfg(test)]
mod escapes;

#[cfg(test)]
mod tests;
