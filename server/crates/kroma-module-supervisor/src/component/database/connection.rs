use std::path::PathBuf;
use std::sync::Arc;

use kroma_sqlite::PooledConn;
use kroma_wasm_host::{SqlConnection, SqlFailure, SqlOutcome, SqlValue};
use rusqlite::types::Value;

use super::{failure, failure_of_any, Kept, SQLITE_AUTH, SQLITE_ERROR};

const SQLITE_TOOBIG: i32 = 18;
const MAX_RESULT_BYTES: usize = 256 * 1024 * 1024;

pub(super) struct HostConnection {
    pub(super) connection: PooledConn,
    pub(super) kept: Option<Arc<Kept>>,
}

fn failure_of(error: rusqlite::Error) -> SqlFailure {
    let code = error.sqlite_error().map_or(SQLITE_ERROR, |e| e.extended_code);
    failure(code, error.to_string())
}

fn bound(value: &SqlValue) -> Value {
    match value {
        SqlValue::Null => Value::Null,
        SqlValue::Integer(i) => Value::Integer(*i),
        SqlValue::Real(r) => Value::Real(*r),
        SqlValue::Text(t) => Value::Text(t.clone()),
        SqlValue::Blob(b) => Value::Blob(b.clone()),
    }
}

fn read(value: Value, spent: &mut usize) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Integer(i) => SqlValue::Integer(i),
        Value::Real(r) => SqlValue::Real(r),
        Value::Text(t) => {
            *spent += t.len();
            SqlValue::Text(t)
        }
        Value::Blob(b) => {
            *spent += b.len();
            SqlValue::Blob(b)
        }
    }
}

impl SqlConnection for HostConnection {
    fn run(&mut self, statement: &str, params: &[SqlValue]) -> Result<SqlOutcome, SqlFailure> {
        let conn: &rusqlite::Connection = &self.connection;
        let mut prepared = conn.prepare_cached(statement).map_err(failure_of)?;
        let columns: Vec<String> = prepared.column_names().iter().map(ToString::to_string).collect();
        let width = columns.len();
        let values = params.iter().map(bound);
        let mut rows = prepared.query(rusqlite::params_from_iter(values)).map_err(failure_of)?;
        let mut collected = Vec::new();
        let mut spent = 0;
        while let Some(row) = rows.next().map_err(failure_of)? {
            let mut one = Vec::with_capacity(width);
            for at in 0..width {
                one.push(read(row.get(at).map_err(failure_of)?, &mut spent));
            }
            collected.push(one);
            if spent > MAX_RESULT_BYTES {
                return Err(failure(SQLITE_TOOBIG, "this result is too large to hand to a module"));
            }
        }
        drop(rows);
        let changes = if prepared.readonly() { 0 } else { conn.changes() };
        Ok(SqlOutcome {
            columns,
            rows: collected,
            changes,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    fn batch(&mut self, statements: &str) -> Result<(), SqlFailure> {
        self.connection.execute_batch(statements).map_err(failure_of)
    }

    fn snapshot(&mut self, target: &str) -> Result<(), SqlFailure> {
        let Some(kept) = &self.kept else {
            return Err(failure(SQLITE_AUTH, "a module keeps no copy of the core database"));
        };
        let target = kept
            .path_of(target)
            .ok_or_else(|| failure(SQLITE_AUTH, "a copy is one of this module's databases, named like one"))?;
        let source = self.connection.path().map(PathBuf::from).ok_or_else(|| failure(SQLITE_ERROR, "no file"))?;
        if target == source {
            return Err(failure(SQLITE_AUTH, "a copy does not replace the database it copies"));
        }
        kroma_sqlite::refuse_unowned(&target).map_err(|error| failure_of_any(&error))?;
        match std::fs::remove_file(&target) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                return Err(failure(SQLITE_ERROR, error.to_string()));
            }
            _ => {}
        }
        let unguarded = kroma_sqlite::open_owned(&source).map_err(|error| failure_of_any(&error))?;
        unguarded
            .execute("VACUUM INTO ?1", [target.to_string_lossy()])
            .map_err(failure_of)?;
        kroma_sqlite::prune_snapshots(&source);
        Ok(())
    }
}

impl Drop for HostConnection {
    fn drop(&mut self) {
        if !self.connection.is_autocommit() {
            let _ = self.connection.execute_batch("ROLLBACK");
        }
    }
}
