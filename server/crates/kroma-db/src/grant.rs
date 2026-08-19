//! Scoped access to the core database, enforced by SQLite itself.
//!
//! A module used to be handed the raw [`Pool`]: unrestricted read/write on every
//! table, granted ambiently to every sidecar. A [`Grant`] replaces that with what
//! the module's `module.json` declares, and [`init_scoped`] hands back a pool
//! whose connections carry it as an `sqlite3_set_authorizer` callback.
//!
//! The authorizer fires for every action while a statement is being PREPARED, so
//! the scope cannot be talked around by building the SQL as a string: an
//! ungranted table fails at `prepare`, before a row is read. It is per-connection,
//! which is what lets one database serve two modules with different scopes.
//!
//! What this is and is not: a sidecar is a native process running as the same
//! user, so it could always open the file itself. The authorizer is not a
//! sandbox against a hostile module -- it makes the grant explicit, auditable in
//! the manifest before install, and enforced for every module that goes through
//! the SDK.

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
/// the default -- a pool that answers nothing.
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
        AuthAction::Insert { table_name } => allows(&grant.write, table_name, ""),
        AuthAction::Delete { table_name } => allows(&grant.write, table_name, ""),
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
mod tests {
    use super::*;

    fn core(tag: &str) -> (crate::testing::TempPool, std::path::PathBuf) {
        let pool = crate::testing::temp_pool(tag);
        let path = pool.path().to_path_buf();
        pool.get()
            .unwrap()
            .execute_batch(
                "INSERT INTO users (id,email,username,password_hash,created_at,permissions) \
                 VALUES ('u1','a@b.c','ana','h','now','[\"playback\"]');
                 INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
                 VALUES ('rq1','movie',603,'The Matrix','approved',1,1);",
            )
            .unwrap();
        (pool, path)
    }

    fn grant(read: &[&str], write: &[&str]) -> Grant {
        Grant {
            read: read.iter().map(|s| s.to_string()).collect(),
            write: write.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn a_granted_table_reads_and_an_ungranted_one_does_not() {
        let (_keep, path) = core("grant-read");
        let pool = init_scoped(&path, "tv.kroma.acquisition", &grant(&["requests"], &[])).unwrap();
        let conn = pool.get().unwrap();

        let title: String =
            conn.query_row("SELECT title FROM requests WHERE id='rq1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "The Matrix");

        // The session tokens and account rows a VPN sidecar used to be able to
        // read for free are exactly what an undeclared table now costs, and the
        // refusal names what it refused.
        let err = conn
            .query_row("SELECT email FROM users WHERE id='u1'", [], |r| r.get::<_, String>(0))
            .unwrap_err();
        assert!(format!("{err}").contains("users.email"), "{err}");
    }

    #[test]
    fn a_column_grant_stops_at_the_column() {
        let (_keep, path) = core("grant-column");
        let pool = init_scoped(&path, "m", &grant(&["users.username", "users.id"], &[])).unwrap();
        let conn = pool.get().unwrap();

        let name: String =
            conn.query_row("SELECT username FROM users WHERE id='u1'", [], |r| r.get(0)).unwrap();
        assert_eq!(name, "ana");

        assert!(conn
            .query_row("SELECT email FROM users WHERE id='u1'", [], |r| r.get::<_, String>(0))
            .is_err());
        // A column is reached by a WHERE as much as by a projection, so a
        // predicate on an ungranted one is refused too.
        assert!(conn.prepare("SELECT username FROM users WHERE email = 'a@b.c'").is_err());
        // `SELECT *` reaches every column, so it fails on the first ungranted one.
        assert!(conn.prepare("SELECT * FROM users").is_err());
    }

    #[test]
    fn reading_is_not_writing() {
        let (_keep, path) = core("grant-write");
        let pool = init_scoped(&path, "m", &grant(&["requests"], &[])).unwrap();
        let conn = pool.get().unwrap();

        assert!(conn.execute("UPDATE requests SET title='x' WHERE id='rq1'", []).is_err());
        assert!(conn.execute("DELETE FROM requests WHERE id='rq1'", []).is_err());
    }

    #[test]
    fn a_write_grant_covers_the_three_verbs() {
        let (_keep, path) = core("grant-verbs");
        let pool = init_scoped(&path, "m", &grant(&["acq_file_tmdb"], &["acq_file_tmdb"])).unwrap();
        let conn = pool.get().unwrap();

        conn.execute("INSERT INTO acq_file_tmdb (abs_path, tmdb_id) VALUES ('/a.mkv', 603)", [])
            .unwrap();
        conn.execute("UPDATE acq_file_tmdb SET tmdb_id = 604 WHERE abs_path = '/a.mkv'", [])
            .unwrap();
        conn.execute("DELETE FROM acq_file_tmdb WHERE abs_path = '/a.mkv'", []).unwrap();
    }

    #[test]
    fn a_foreign_key_pulls_its_other_table_into_the_grant() {
        // `PRAGMA foreign_keys = ON` makes a constraint check a real read of the
        // parent, and a cascade a real delete from the child -- so neither side
        // of a foreign key is reachable on a grant that names only one table.
        // Pinned because it is the one rule the manifest does not show: a module
        // writing `wanted` must also declare that it reads `requests`.
        let (_keep, path) = core("grant-fk");
        let insert = "INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
                      VALUES ('wt1','rq1','movie',603,'The Matrix','wanted',1)";

        let write_only = init_scoped(&path, "m", &grant(&[], &["wanted"])).unwrap();
        assert!(write_only.get().unwrap().execute(insert, []).is_err());

        let with_parent = init_scoped(&path, "m", &grant(&["requests.id"], &["wanted"])).unwrap();
        with_parent.get().unwrap().execute(insert, []).unwrap();

        // ON DELETE CASCADE: removing the parent writes the child.
        let parent_only =
            init_scoped(&path, "m", &grant(&["requests"], &["requests"])).unwrap();
        assert!(parent_only
            .get()
            .unwrap()
            .execute("DELETE FROM requests WHERE id='rq1'", [])
            .is_err());
    }

    #[test]
    fn an_empty_grant_answers_nothing() {
        let (_keep, path) = core("grant-empty");
        let pool = init_scoped(&path, "tv.kroma.vpn", &Grant::none()).unwrap();
        let conn = pool.get().unwrap();
        assert!(conn.prepare("SELECT id FROM requests").is_err());
        assert!(conn.prepare("SELECT id FROM users").is_err());
    }

    #[test]
    fn the_schema_is_not_the_core_database() {
        // ATTACH would re-open the same file under a name the per-table rules
        // never see, and DDL would let a module reshape tables it cannot read.
        let (_keep, path) = core("grant-escape");
        let pool = init_scoped(&path, "m", &grant(&["requests"], &["requests"])).unwrap();
        let conn = pool.get().unwrap();

        assert!(conn.execute("ATTACH DATABASE ':memory:' AS side", []).is_err());
        assert!(conn.execute("CREATE TABLE mine (id TEXT)", []).is_err());
        assert!(conn.execute("DROP TABLE requests", []).is_err());
        assert!(conn.execute("ALTER TABLE requests ADD COLUMN sneaky TEXT", []).is_err());
    }

    #[test]
    fn an_aggregate_over_a_granted_table_still_runs() {
        // `count(*)` raises a table-level READ with an empty column plus a
        // FUNCTION action; both have to pass or every module query breaks.
        let (_keep, path) = core("grant-aggregate");
        let pool = init_scoped(&path, "m", &grant(&["requests.id"], &[])).unwrap();
        let conn = pool.get().unwrap();
        let n: i64 = conn.query_row("SELECT count(*) FROM requests", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn two_modules_read_the_same_database_through_different_scopes() {
        let (_keep, path) = core("grant-two");
        let a = init_scoped(&path, "a", &grant(&["requests"], &[])).unwrap();
        let b = init_scoped(&path, "b", &grant(&["users.username"], &[])).unwrap();

        assert!(a.get().unwrap().prepare("SELECT title FROM requests").is_ok());
        assert!(a.get().unwrap().prepare("SELECT username FROM users").is_err());
        assert!(b.get().unwrap().prepare("SELECT username FROM users").is_ok());
        assert!(b.get().unwrap().prepare("SELECT title FROM requests").is_err());
    }

    #[test]
    fn a_grant_round_trips_through_the_manifest_shape() {
        let g: Grant =
            serde_json::from_str(r#"{ "read": ["requests", "users.username"], "write": ["wanted"] }"#)
                .unwrap();
        assert_eq!(g.read, ["requests", "users.username"]);
        assert_eq!(g.write, ["wanted"]);
        assert_eq!(serde_json::from_value::<Grant>(serde_json::to_value(&g).unwrap()).unwrap(), g);
        // An absent object is the empty grant, not an error.
        assert_eq!(serde_json::from_str::<Grant>("{}").unwrap(), Grant::none());
    }

    #[test]
    fn table_and_column_entries_for_one_table_keep_the_wider_grant() {
        let compiled = grant(&["users.username", "users"], &[]).compile();
        assert!(allows(&compiled.read, "users", "email"));
        // Order must not matter.
        let compiled = grant(&["users", "users.username"], &[]).compile();
        assert!(allows(&compiled.read, "users", "email"));
    }

    #[test]
    fn a_table_name_matches_whatever_case_the_sql_used() {
        let compiled = grant(&["Requests.Title"], &[]).compile();
        assert!(allows(&compiled.read, "requests", "title"));
        assert!(allows(&compiled.read, "REQUESTS", "TITLE"));
        assert!(!allows(&compiled.read, "requests", "status"));
    }
}
