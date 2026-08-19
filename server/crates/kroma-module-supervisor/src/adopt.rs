//! Moving a module's own tables out of the core database and into its own file.
//!
//! A table only that module reads has no business in the shared database, but it
//! is where the first version of every module put it -- with the user's indexer
//! API keys and download-client passwords in it. This is the one-way move, run by
//! the CORE before the module is spawned, because the module itself no longer
//! holds the rights to do it (its grant covers neither the table nor DDL).
//!
//! It is schema-agnostic: the `CREATE` statement is copied verbatim out of
//! `sqlite_master`, so the destination table is byte-for-byte the one the module
//! wrote, indexes included. It runs exactly once, because it ends by dropping the
//! core copy.

use anyhow::{Context, Result};
use rusqlite::Connection;

/// Move `tables` from the core database into the module's own `store_path`.
///
/// A table that is already gone from the core (moved on a previous boot, or
/// never created) is skipped, which is what makes this safe to call on every
/// spawn. One that cannot be moved leaves the core copy untouched and reports
/// why: losing the rows would be worse than starting the module without them.
pub fn adopt_tables(core: &Connection, store_path: &std::path::Path, tables: &[String]) -> Result<usize> {
    let pending: Vec<&String> =
        tables.iter().filter(|t| table_exists(core, "main", t).unwrap_or(false)).collect();
    if pending.is_empty() {
        return Ok(0);
    }

    core.execute("ATTACH DATABASE ?1 AS store", [store_path.to_string_lossy().as_ref()])
        .context("attach the module's own database")?;
    let outcome = move_each(core, &pending);
    // Detach whatever happened: a connection that keeps the module's file
    // attached would block the sidecar's own writes.
    let _ = core.execute("DETACH DATABASE store", []);
    outcome
}

fn move_each(core: &Connection, tables: &[&String]) -> Result<usize> {
    let mut moved = 0;
    for table in tables {
        // Not an error: the module created it itself on a boot where the move
        // had not run yet, so the core copy is the stale one. Left alone rather
        // than merged, because guessing which side is current is guessing.
        if table_exists(core, "store", table)? {
            tracing::warn!(
                table = %table,
                "both databases hold this table; leaving the core copy in place"
            );
            continue;
        }
        match move_one(core, table) {
            Ok(rows) => {
                moved += 1;
                tracing::info!(table = %table, rows, "moved into the module's own database");
            }
            Err(error) => tracing::error!(
                table = %table,
                error = %format!("{error:#}"),
                "could not move this table; it stays in the core database"
            ),
        }
    }
    Ok(moved)
}

fn move_one(core: &Connection, table: &str) -> Result<i64> {
    let ddl = schema_of(core, table)?;
    // A foreign key into a core table cannot travel: the parent stays behind and
    // the constraint would be unsatisfiable in the new file. Such a table is
    // shared by definition, so it belongs in the core schema, not here.
    for sql in &ddl {
        anyhow::ensure!(
            !sql.to_ascii_uppercase().contains("REFERENCES"),
            "'{table}' has a foreign key into the core database, so it cannot be module-private",
        );
    }

    core.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> Result<i64> {
        for sql in &ddl {
            // sqlite_master stores the statement unqualified; the destination has
            // to be named or it would recreate the table it is being moved from.
            core.execute_batch(&qualify(sql, table))?;
        }
        core.execute(&format!("INSERT INTO store.\"{table}\" SELECT * FROM main.\"{table}\""), [])?;
        let copied: i64 = count(core, "store", table)?;
        let original: i64 = count(core, "main", table)?;
        anyhow::ensure!(copied == original, "copied {copied} of {original} rows");
        core.execute_batch(&format!("DROP TABLE main.\"{table}\""))?;
        Ok(copied)
    })();
    match result {
        Ok(rows) => {
            core.execute_batch("COMMIT")?;
            Ok(rows)
        }
        Err(e) => {
            let _ = core.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

// The table's own `CREATE TABLE` plus every index on it, exactly as SQLite
// stored them. Auto-indexes (a UNIQUE / PRIMARY KEY constraint) have a NULL sql
// and come back with the table statement itself, so they are skipped here.
fn schema_of(core: &Connection, table: &str) -> Result<Vec<String>> {
    let mut stmt = core.prepare(
        "SELECT sql FROM main.sqlite_master \
         WHERE sql IS NOT NULL AND (name = ?1 OR (type = 'index' AND tbl_name = ?1)) \
         ORDER BY type = 'index'",
    )?;
    let out: Vec<String> = stmt.query_map([table], |r| r.get(0))?.collect::<Result<_, _>>()?;
    anyhow::ensure!(!out.is_empty(), "'{table}' has no schema to copy");
    Ok(out)
}

// Point a `CREATE TABLE x` / `CREATE INDEX i ON x` at the attached database.
// Only the created object is qualified; `ON <table>` inside a CREATE INDEX
// resolves within the same schema.
fn qualify(sql: &str, table: &str) -> String {
    for prefix in ["CREATE TABLE IF NOT EXISTS ", "CREATE TABLE ", "CREATE UNIQUE INDEX IF NOT EXISTS ", "CREATE UNIQUE INDEX ", "CREATE INDEX IF NOT EXISTS ", "CREATE INDEX "] {
        if let Some(rest) = strip_prefix_ci(sql, prefix) {
            return format!("{prefix}store.{rest}");
        }
    }
    // Nothing recognised: run it as written against the attached database, which
    // is the current schema for the duration of the batch below.
    format!("CREATE TABLE store.\"{table}\" AS SELECT * FROM main.\"{table}\" WHERE 0")
}

fn strip_prefix_ci<'a>(sql: &'a str, prefix: &str) -> Option<&'a str> {
    let head = sql.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix).then(|| &sql[prefix.len()..])
}

fn table_exists(conn: &Connection, schema: &str, name: &str) -> Result<bool> {
    let n: i64 = conn.query_row(
        &format!("SELECT count(*) FROM {schema}.sqlite_master WHERE type='table' AND name=?1"),
        [name],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

fn count(conn: &Connection, schema: &str, table: &str) -> Result<i64> {
    Ok(conn.query_row(&format!("SELECT count(*) FROM {schema}.\"{table}\""), [], |r| r.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn core_with_indexers(dir: &std::path::Path) -> Connection {
        let conn = Connection::open(dir.join("kroma.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE indexers (id TEXT PRIMARY KEY, name TEXT NOT NULL, api_key TEXT NOT NULL);
             CREATE INDEX idx_indexers_name ON indexers(name);
             INSERT INTO indexers VALUES ('ix1','Jackett','secret');
             INSERT INTO indexers VALUES ('ix2','Prowlarr','other');",
        )
        .unwrap();
        conn
    }

    fn store_path(dir: &std::path::Path) -> std::path::PathBuf {
        dir.join("module.sqlite")
    }

    #[test]
    fn a_table_moves_with_its_rows_and_indexes_and_leaves_the_core() {
        let dir = kroma_testing::temp_dir("adopt-move");
        let core = core_with_indexers(dir.path());
        let store = store_path(dir.path());

        assert_eq!(adopt_tables(&core, &store, &["indexers".to_string()]).unwrap(), 1);
        assert!(!table_exists(&core, "main", "indexers").unwrap(), "the core copy is gone");

        let moved = Connection::open(&store).unwrap();
        let key: String =
            moved.query_row("SELECT api_key FROM indexers WHERE id='ix1'", [], |r| r.get(0)).unwrap();
        assert_eq!(key, "secret", "the rows travelled, credentials included");
        assert_eq!(count(&moved, "main", "indexers").unwrap(), 2);
        // The index came too, so the module's queries keep their plan.
        let idx: i64 = moved
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='idx_indexers_name'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn moving_twice_is_the_same_as_moving_once() {
        // Every spawn calls this; the second one must be a no-op rather than a
        // second copy or an error.
        let dir = kroma_testing::temp_dir("adopt-twice");
        let core = core_with_indexers(dir.path());
        let store = store_path(dir.path());
        let tables = vec!["indexers".to_string()];

        assert_eq!(adopt_tables(&core, &store, &tables).unwrap(), 1);
        assert_eq!(adopt_tables(&core, &store, &tables).unwrap(), 0);
        assert_eq!(adopt_tables(&core, &store, &tables).unwrap(), 0);

        let moved = Connection::open(&store).unwrap();
        assert_eq!(count(&moved, "main", "indexers").unwrap(), 2, "rows were not duplicated");
    }

    #[test]
    fn a_table_the_core_never_had_is_not_an_error() {
        let dir = kroma_testing::temp_dir("adopt-absent");
        let core = Connection::open(dir.path().join("kroma.db")).unwrap();
        assert_eq!(
            adopt_tables(&core, &store_path(dir.path()), &["nothing".to_string()]).unwrap(),
            0
        );
    }

    #[test]
    fn a_table_with_a_foreign_key_into_the_core_stays_where_it_is() {
        // `downloads.request_id` references `requests`: the parent cannot travel,
        // so neither can the child. It must survive in the core rather than be
        // half-moved.
        let dir = kroma_testing::temp_dir("adopt-fk");
        let core = Connection::open(dir.path().join("kroma.db")).unwrap();
        core.execute_batch(
            "CREATE TABLE requests (id TEXT PRIMARY KEY);
             CREATE TABLE downloads (id TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id));
             INSERT INTO requests VALUES ('rq1');
             INSERT INTO downloads VALUES ('d1','rq1');",
        )
        .unwrap();

        assert_eq!(
            adopt_tables(&core, &store_path(dir.path()), &["downloads".to_string()]).unwrap(),
            0
        );
        assert_eq!(count(&core, "main", "downloads").unwrap(), 1, "the rows are still there");
    }

    #[test]
    fn a_table_the_module_already_recreated_is_left_alone() {
        // The module ran once under a host that did not move it, so both sides
        // exist. Merging would guess; this reports and keeps both.
        let dir = kroma_testing::temp_dir("adopt-both");
        let core = core_with_indexers(dir.path());
        let store = store_path(dir.path());
        Connection::open(&store)
            .unwrap()
            .execute_batch("CREATE TABLE indexers (id TEXT PRIMARY KEY, name TEXT, api_key TEXT)")
            .unwrap();

        assert_eq!(adopt_tables(&core, &store, &["indexers".to_string()]).unwrap(), 0);
        assert_eq!(count(&core, "main", "indexers").unwrap(), 2, "nothing was dropped");
    }
}
