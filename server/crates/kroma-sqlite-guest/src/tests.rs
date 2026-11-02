use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, Once};

use real_rusqlite::types::Value as RealValue;

use crate::types::Value;
use crate::{
    params, params_from_iter, set_backend, Backend, Connection, Error, ErrorCode, Failure,
    OptionalExtension, Outcome, TransactionBehavior,
};

#[derive(Default)]
struct OnARealDatabase {
    connections: Mutex<HashMap<u32, real_rusqlite::Connection>>,
    next: Mutex<u32>,
}

fn failure_of(error: real_rusqlite::Error) -> Failure {
    let code = error.sqlite_error().map_or(1, |e| e.extended_code);
    Failure {
        code,
        message: error.to_string(),
    }
}

fn real_of(value: Value) -> RealValue {
    match value {
        Value::Null => RealValue::Null,
        Value::Integer(i) => RealValue::Integer(i),
        Value::Real(r) => RealValue::Real(r),
        Value::Text(t) => RealValue::Text(t),
        Value::Blob(b) => RealValue::Blob(b),
    }
}

fn value_of(value: RealValue) -> Value {
    match value {
        RealValue::Null => Value::Null,
        RealValue::Integer(i) => Value::Integer(i),
        RealValue::Real(r) => Value::Real(r),
        RealValue::Text(t) => Value::Text(t),
        RealValue::Blob(b) => Value::Blob(b),
    }
}

impl Backend for OnARealDatabase {
    fn open(&self, _path: &str) -> Result<u32, Failure> {
        let connection = real_rusqlite::Connection::open_in_memory().map_err(failure_of)?;
        let mut next = self.next.lock().unwrap();
        *next += 1;
        self.connections.lock().unwrap().insert(*next, connection);
        Ok(*next)
    }

    fn close(&self, connection: u32) {
        self.connections.lock().unwrap().remove(&connection);
    }

    fn run(&self, connection: u32, statement: &str, params: Vec<Value>) -> Result<Outcome, Failure> {
        let connections = self.connections.lock().unwrap();
        let conn = &connections[&connection];
        let mut prepared = conn.prepare(statement).map_err(failure_of)?;
        let columns: Vec<String> = prepared.column_names().iter().map(ToString::to_string).collect();
        let width = columns.len();
        let bound = real_rusqlite::params_from_iter(params.into_iter().map(real_of));
        let mut rows = prepared.query(bound).map_err(failure_of)?;
        let mut collected = Vec::new();
        while let Some(row) = rows.next().map_err(failure_of)? {
            let mut values = Vec::with_capacity(width);
            for at in 0..width {
                values.push(value_of(row.get(at).map_err(failure_of)?));
            }
            collected.push(values);
        }
        Ok(Outcome {
            columns,
            rows: collected,
            changes: conn.changes(),
            last_insert_rowid: conn.last_insert_rowid(),
        })
    }

    fn batch(&self, connection: u32, statements: &str) -> Result<(), Failure> {
        let connections = self.connections.lock().unwrap();
        connections[&connection].execute_batch(statements).map_err(failure_of)
    }

    fn snapshot(&self, _connection: u32, _target: &str) -> Result<(), Failure> {
        Ok(())
    }
}

fn connection() -> Connection {
    static WIRED: Once = Once::new();
    WIRED.call_once(|| set_backend(Box::leak(Box::new(OnARealDatabase::default()))));
    let conn = Connection::open(Path::new("anything.sqlite")).unwrap();
    conn.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE, size REAL, raw BLOB)")
        .unwrap();
    conn
}

#[test]
fn a_row_written_with_params_reads_back_as_each_type() {
    let conn = connection();

    conn.execute(
        "INSERT INTO t (name, size, raw) VALUES (?1, ?2, ?3)",
        params!["a", 1.5_f64, vec![1_u8, 2]],
    )
    .unwrap();
    let read = conn
        .query_row("SELECT id, name, size, raw FROM t", [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>("name")?,
                row.get::<_, f64>(2)?,
                row.get::<_, Vec<u8>>(3)?,
            ))
        })
        .unwrap();

    assert_eq!(read, (1, "a".to_string(), 1.5, vec![1, 2]));
}

#[test]
fn query_map_walks_every_row_in_order() {
    let conn = connection();
    conn.execute_batch("INSERT INTO t (name) VALUES ('a'), ('b'), ('c')")
        .unwrap();

    let mut statement = conn.prepare("SELECT name FROM t ORDER BY name DESC").unwrap();
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(names, ["c", "b", "a"]);
}

#[test]
fn optional_turns_no_rows_into_none() {
    let conn = connection();

    let found: Option<i64> = conn
        .query_row("SELECT id FROM t WHERE name = ?1", ["missing"], |row| row.get(0))
        .optional()
        .unwrap();

    assert_eq!(found, None);
}

#[test]
fn a_null_reads_as_none_and_as_an_error_into_a_plain_type() {
    let conn = connection();
    conn.execute("INSERT INTO t (name) VALUES (?1)", ("a",)).unwrap();

    let (size, plain) = conn
        .query_row("SELECT size, size FROM t", [], |row| {
            Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, f64>(1)))
        })
        .unwrap();

    assert_eq!(size, None);
    assert!(matches!(plain, Err(Error::InvalidColumnType(1, _, _))));
}

#[test]
fn a_transaction_rolls_back_unless_it_commits() {
    let mut conn = connection();

    {
        let tx = conn.transaction().unwrap();
        tx.execute("INSERT INTO t (name) VALUES ('gone')", []).unwrap();
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).unwrap();
    tx.execute("INSERT INTO t (name) VALUES ('kept')", []).unwrap();
    tx.commit().unwrap();
    let mut statement = conn.prepare("SELECT name FROM t").unwrap();
    let names: Vec<String> = statement
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(names, ["kept"]);
}

#[test]
fn a_constraint_failure_keeps_its_code() {
    let conn = connection();
    conn.execute("INSERT INTO t (name) VALUES ('a')", []).unwrap();

    let error = conn.execute("INSERT INTO t (name) VALUES ('a')", []).unwrap_err();

    let Error::SqliteFailure(failure, _) = error else {
        panic!("a database failure");
    };
    assert_eq!(failure.code, ErrorCode::ConstraintViolation);
}

#[test]
fn an_insert_reports_its_rowid_and_its_changes() {
    let conn = connection();

    let changed = conn.execute("INSERT INTO t (name) VALUES ('a')", []).unwrap();

    assert_eq!(changed, 1);
    assert_eq!(conn.last_insert_rowid(), 1);
}

#[test]
fn params_from_an_iterator_bind_in_order() {
    let conn = connection();
    conn.execute_batch("INSERT INTO t (name) VALUES ('a'), ('b'), ('c')")
        .unwrap();

    let counted: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM t WHERE name IN (?1, ?2)",
            params_from_iter(["a", "c"]),
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(counted, 2);
}

#[test]
fn a_mutable_query_steps_with_next() {
    let conn = connection();
    conn.execute_batch("INSERT INTO t (name) VALUES ('a')").unwrap();

    let mut statement = conn.prepare("SELECT name FROM t").unwrap();
    let mut rows = statement.query([]).unwrap();
    let first: String = rows.next().unwrap().unwrap().get(0).unwrap();
    let second = rows.next().unwrap().is_none();

    assert_eq!(first, "a");
    assert!(second);
}

#[test]
fn a_pragma_update_quotes_text_and_writes_integers_bare() {
    let conn = connection();

    conn.pragma_update(None, "user_version", 7).unwrap();
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();

    assert_eq!(version, 7);
}
