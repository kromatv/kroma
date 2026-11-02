use std::path::{Component, Path, PathBuf};

use kroma_sqlite::PooledConn;
use kroma_wasm_host::{Databases, SqlConnection, SqlFailure, SqlOutcome, SqlValue};
use rusqlite::types::Value;

const SQLITE_ERROR: i32 = 1;
const SQLITE_AUTH: i32 = 23;
const TEST_MODULE: &str = "test";

pub(crate) struct ScratchDatabases {
    scratch: PathBuf,
}

impl ScratchDatabases {
    pub(crate) fn new(scratch: PathBuf) -> Self {
        Self { scratch }
    }

    fn holds(&self, path: &Path) -> bool {
        path.starts_with(&self.scratch)
            && !path.components().any(|part| part == Component::ParentDir)
    }
}

fn failure(code: i32, message: impl Into<String>) -> SqlFailure {
    SqlFailure {
        code,
        message: message.into(),
    }
}

fn failure_of(error: &rusqlite::Error) -> SqlFailure {
    let code = error
        .sqlite_error()
        .map_or(SQLITE_ERROR, |e| e.extended_code);
    failure(code, error.to_string())
}

impl Databases for ScratchDatabases {
    fn open(&self, path: &str) -> Result<Box<dyn SqlConnection>, SqlFailure> {
        let file = Path::new(path);
        if !self.holds(file) {
            return Err(failure(
                SQLITE_AUTH,
                format!("{path} is outside the test's scratch dir"),
            ));
        }
        let connection = kroma_sqlite::open_guarded(file, TEST_MODULE)
            .and_then(|pool| pool.get())
            .map_err(|error| failure(SQLITE_ERROR, format!("{error:#}")))?;
        Ok(Box::new(ScratchConnection { connection }))
    }
}

struct ScratchConnection {
    connection: PooledConn,
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

fn read(value: Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Integer(i) => SqlValue::Integer(i),
        Value::Real(r) => SqlValue::Real(r),
        Value::Text(t) => SqlValue::Text(t),
        Value::Blob(b) => SqlValue::Blob(b),
    }
}

impl SqlConnection for ScratchConnection {
    fn run(&mut self, statement: &str, params: &[SqlValue]) -> Result<SqlOutcome, SqlFailure> {
        let conn: &rusqlite::Connection = &self.connection;
        let mut prepared = conn.prepare_cached(statement).map_err(|e| failure_of(&e))?;
        let columns: Vec<String> = prepared
            .column_names()
            .iter()
            .map(ToString::to_string)
            .collect();
        let width = columns.len();
        let mut rows = prepared
            .query(rusqlite::params_from_iter(params.iter().map(bound)))
            .map_err(|e| failure_of(&e))?;
        let mut collected = Vec::new();
        while let Some(row) = rows.next().map_err(|e| failure_of(&e))? {
            let one = (0..width)
                .map(|at| row.get(at).map(read))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| failure_of(&e))?;
            collected.push(one);
        }
        drop(rows);
        let changes = if prepared.readonly() {
            0
        } else {
            conn.changes()
        };
        Ok(SqlOutcome {
            columns,
            rows: collected,
            changes,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    fn batch(&mut self, statements: &str) -> Result<(), SqlFailure> {
        self.connection
            .execute_batch(statements)
            .map_err(|e| failure_of(&e))
    }

    fn snapshot(&mut self, target: &str) -> Result<(), SqlFailure> {
        let path = self
            .connection
            .path()
            .map(PathBuf::from)
            .ok_or_else(|| failure(SQLITE_ERROR, "no file"))?;
        let unguarded = rusqlite::Connection::open(path).map_err(|e| failure_of(&e))?;
        unguarded
            .execute("VACUUM INTO ?1", [target])
            .map(|_| ())
            .map_err(|e| failure_of(&e))
    }
}

impl Drop for ScratchConnection {
    fn drop(&mut self) {
        if !self.connection.is_autocommit() {
            let _ = self.connection.execute_batch("ROLLBACK");
        }
    }
}
