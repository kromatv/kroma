use kroma_sqlite::guest::{Backend, Failure, Outcome, Value};

use super::kroma::module::sql;

pub(super) struct ThroughTheHost;

pub(super) static THROUGH_THE_HOST: ThroughTheHost = ThroughTheHost;

fn failure_of(failure: sql::Failure) -> Failure {
    Failure {
        code: failure.code,
        message: failure.message,
    }
}

fn wire_of(value: Value) -> sql::Value {
    match value {
        Value::Null => sql::Value::Null,
        Value::Integer(i) => sql::Value::Integer(i),
        Value::Real(r) => sql::Value::Real(r),
        Value::Text(t) => sql::Value::Text(t),
        Value::Blob(b) => sql::Value::Blob(b),
    }
}

fn value_of(value: sql::Value) -> Value {
    match value {
        sql::Value::Null => Value::Null,
        sql::Value::Integer(i) => Value::Integer(i),
        sql::Value::Real(r) => Value::Real(r),
        sql::Value::Text(t) => Value::Text(t),
        sql::Value::Blob(b) => Value::Blob(b),
    }
}

impl Backend for ThroughTheHost {
    fn open(&self, path: &str) -> Result<u32, Failure> {
        sql::open(path).map_err(failure_of)
    }

    fn close(&self, connection: u32) {
        sql::close(connection);
    }

    fn run(&self, connection: u32, statement: &str, params: Vec<Value>) -> Result<Outcome, Failure> {
        let params: Vec<sql::Value> = params.into_iter().map(wire_of).collect();
        let outcome = sql::run(connection, statement, &params).map_err(failure_of)?;
        Ok(Outcome {
            columns: outcome.columns,
            rows: outcome
                .rows
                .into_iter()
                .map(|row| row.into_iter().map(value_of).collect())
                .collect(),
            changes: outcome.changes,
            last_insert_rowid: outcome.last_insert_rowid,
        })
    }

    fn batch(&self, connection: u32, statements: &str) -> Result<(), Failure> {
        sql::batch(connection, statements).map_err(failure_of)
    }

    fn snapshot(&self, connection: u32, target: &str) -> Result<(), Failure> {
        sql::snapshot(connection, target).map_err(failure_of)
    }
}
