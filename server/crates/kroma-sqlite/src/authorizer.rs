//! The authorizer behind a scoped pool. SQLite calls it for every action while a
//! statement is prepared.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use anyhow::Result;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;

use crate::Grant;

/// Reading a table's schema is not reading its data, and denying it breaks
/// `PRAGMA table_info` and rusqlite's own column lookups for statements that are
/// otherwise allowed.
const SCHEMA_TABLES: [&str; 3] = ["sqlite_master", "sqlite_schema", "sqlite_temp_master"];

const OWN_FILE_PRAGMAS: [&str; 12] = [
    "user_version",
    "foreign_keys",
    "foreign_key_check",
    "foreign_key_list",
    "table_info",
    "table_xinfo",
    "index_list",
    "index_info",
    "journal_mode",
    "busy_timeout",
    "synchronous",
    "defer_foreign_keys",
];

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
                let slot = out
                    .entry(table.trim().to_ascii_lowercase())
                    .or_insert_with(|| Some(BTreeSet::new()));
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
        AuthAction::Read {
            table_name,
            column_name,
        } => format!("read {table_name}.{column_name}"),
        AuthAction::Insert { table_name } => format!("insert into {table_name}"),
        AuthAction::Update {
            table_name,
            column_name,
        } => {
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

        AuthAction::Read {
            table_name,
            column_name,
        } => SCHEMA_TABLES.contains(table_name) || allows(&grant.read, table_name, column_name),
        AuthAction::Insert { table_name } => allows_whole_table(&grant.write, table_name),
        AuthAction::Delete { table_name } => allows_whole_table(&grant.write, table_name),
        AuthAction::Update {
            table_name,
            column_name,
        } => allows(&grant.write, table_name, column_name),

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

fn decide_own_file(module_id: &str, ctx: &AuthContext<'_>) -> Authorization {
    let allow = match &ctx.action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => false,
        AuthAction::Pragma { pragma_name, .. } => OWN_FILE_PRAGMAS
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(pragma_name)),
        AuthAction::Function { function_name } => !function_name.eq_ignore_ascii_case("load_extension"),
        _ => true,
    };
    if allow {
        Authorization::Allow
    } else {
        tracing::warn!(
            module = %module_id,
            denied = %describe(&ctx.action),
            "a module asked for something outside its own database"
        );
        Authorization::Deny
    }
}

enum Rule {
    Granted(Arc<Compiled>),
    OwnFile,
}

/// The authorizer a scoped [`crate::Pool`] installs on each connection it opens.
pub(crate) struct Scope {
    module_id: String,
    rule: Rule,
}

impl Scope {
    pub(crate) fn granted(module_id: &str, grant: &Grant) -> Self {
        Self {
            module_id: module_id.to_string(),
            rule: Rule::Granted(Arc::new(compile(grant))),
        }
    }

    pub(crate) fn own_file(module_id: &str) -> Self {
        Self {
            module_id: module_id.to_string(),
            rule: Rule::OwnFile,
        }
    }

    pub(crate) fn install(&self, conn: &Connection) -> Result<()> {
        let module_id = self.module_id.clone();
        match &self.rule {
            Rule::Granted(grant) => {
                let grant = Arc::clone(grant);
                conn.authorizer(Some(move |ctx: AuthContext<'_>| {
                    decide(&module_id, &grant, &ctx)
                }))?;
            }
            Rule::OwnFile => {
                conn.authorizer(Some(move |ctx: AuthContext<'_>| decide_own_file(&module_id, &ctx)))?;
            }
        }
        Ok(())
    }
}

// Unparseable entries are dropped rather than failing the module: a typo in a
// manifest costs that one grant, loudly, not the whole boot.
fn compile(grant: &Grant) -> Compiled {
    Compiled {
        read: columns_by_table(&grant.read),
        write: columns_by_table(&grant.write),
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    fn grant(read: &[&str], write: &[&str]) -> Grant {
        Grant {
            read: read.iter().map(ToString::to_string).collect(),
            write: write.iter().map(ToString::to_string).collect(),
        }
    }

    #[test]
    fn a_grant_round_trips_through_the_manifest_shape() {
        let g: Grant =
            serde_json::from_str(r#"{ "read": ["requests", "users.username"], "write": ["wanted"] }"#)
                .unwrap();
        assert_eq!(g.read, ["requests", "users.username"]);
        assert_eq!(g.write, ["wanted"]);
        assert_eq!(
            serde_json::from_value::<Grant>(serde_json::to_value(&g).unwrap()).unwrap(),
            g
        );
        // An absent object is the empty grant, not an error.
        assert_eq!(serde_json::from_str::<Grant>("{}").unwrap(), Grant::none());
    }

    #[test]
    fn table_and_column_entries_for_one_table_keep_the_wider_grant() {
        let compiled = compile(&grant(&["users.username", "users"], &[]));
        assert!(allows(&compiled.read, "users", "email"));
        // Order must not matter.
        let compiled = compile(&grant(&["users", "users.username"], &[]));
        assert!(allows(&compiled.read, "users", "email"));
    }

    #[test]
    fn a_table_name_matches_whatever_case_the_sql_used() {
        let compiled = compile(&grant(&["Requests.Title"], &[]));
        assert!(allows(&compiled.read, "requests", "title"));
        assert!(allows(&compiled.read, "REQUESTS", "TITLE"));
        assert!(!allows(&compiled.read, "requests", "status"));
    }

    #[test]
    fn a_guarded_file_keeps_its_schema_and_refuses_to_reach_another_file() {
        let dir = kroma_testing::temp_dir("guarded-file");
        let pool = crate::open_guarded(&dir.path().join("own.sqlite"), "tv.example.own").unwrap();
        let conn = pool.get().unwrap();
        conn.execute_batch("CREATE TABLE t (id INTEGER)").unwrap();

        let attach = conn.execute_batch("ATTACH DATABASE '/tmp/elsewhere.sqlite' AS other");
        let vacuum = conn.execute("VACUUM INTO '/tmp/elsewhere.sqlite'", []);
        let wide_open = conn.execute_batch("PRAGMA writable_schema = ON");
        let version = conn.execute_batch("PRAGMA user_version = 3");

        assert!(attach.is_err());
        assert!(vacuum.is_err());
        assert!(wide_open.is_err());
        assert!(version.is_ok());
    }
}
