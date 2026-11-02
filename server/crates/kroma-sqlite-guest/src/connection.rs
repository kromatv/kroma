use std::cell::Cell;
use std::ops::Deref;
use std::path::Path;
use std::time::Duration;

use crate::backend::{backend, Outcome};
use crate::params::Params;
use crate::statement::{Row, Statement};
use crate::types::{ToSql, Value};
use crate::{Error, Result};

/// One connection the host holds open for this component.
#[derive(Debug)]
pub struct Connection {
    handle: u32,
    last_insert_rowid: Cell<i64>,
    changes: Cell<u64>,
}

/// When a transaction takes its locks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum TransactionBehavior {
    Deferred,
    Immediate,
    Exclusive,
}

impl Connection {
    /// Ask the host for a connection to the database at `path`.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref().to_string_lossy();
        let handle = backend()?.open(&path)?;
        Ok(Self {
            handle,
            last_insert_rowid: Cell::new(0),
            changes: Cell::new(0),
        })
    }

    pub(crate) fn run(&self, statement: &str, params: Vec<Value>) -> Result<Outcome> {
        let outcome = backend()?.run(self.handle, statement, params)?;
        self.last_insert_rowid.set(outcome.last_insert_rowid);
        self.changes.set(outcome.changes);
        Ok(outcome)
    }

    pub fn execute<P: Params>(&self, sql: &str, params: P) -> Result<usize> {
        let outcome = self.run(sql, params.values()?)?;
        Ok(usize::try_from(outcome.changes).unwrap_or(usize::MAX))
    }

    pub fn execute_batch(&self, sql: &str) -> Result<()> {
        backend()?.batch(self.handle, sql)?;
        Ok(())
    }

    pub fn prepare(&self, sql: &str) -> Result<Statement<'_>> {
        Ok(Statement::new(self, sql))
    }

    pub fn prepare_cached(&self, sql: &str) -> Result<Statement<'_>> {
        self.prepare(sql)
    }

    pub fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> Result<T>,
    {
        self.prepare(sql)?.query_row(params, f)
    }

    pub fn last_insert_rowid(&self) -> i64 {
        self.last_insert_rowid.get()
    }

    pub fn changes(&self) -> u64 {
        self.changes.get()
    }

    pub fn is_autocommit(&self) -> bool {
        false
    }

    pub fn busy_timeout(&self, _timeout: Duration) -> Result<()> {
        Ok(())
    }

    pub fn pragma_update<V: ToSql>(&self, _schema: Option<&str>, name: &str, value: V) -> Result<()> {
        let literal = match value.to_sql()?.into_value() {
            Value::Integer(i) => i.to_string(),
            Value::Real(r) => r.to_string(),
            Value::Text(t) => format!("'{}'", t.replace('\'', "''")),
            Value::Null | Value::Blob(_) => return Err(Error::InvalidQuery),
        };
        self.execute_batch(&format!("PRAGMA {name} = {literal}"))
    }

    pub fn pragma_query_value<T, F>(&self, _schema: Option<&str>, name: &str, f: F) -> Result<T>
    where
        F: FnOnce(&Row<'_>) -> Result<T>,
    {
        self.query_row(&format!("PRAGMA {name}"), (), f)
    }

    pub fn transaction(&mut self) -> Result<Transaction<'_>> {
        self.transaction_with_behavior(TransactionBehavior::Deferred)
    }

    pub fn transaction_with_behavior(&mut self, behavior: TransactionBehavior) -> Result<Transaction<'_>> {
        Transaction::begin(self, behavior)
    }

    pub fn unchecked_transaction(&self) -> Result<Transaction<'_>> {
        Transaction::begin(self, TransactionBehavior::Deferred)
    }

    /// Keep a copy of this database at `target`, on the host.
    pub fn snapshot_to(&self, target: &Path) -> Result<()> {
        backend()?.snapshot(self.handle, &target.to_string_lossy())?;
        Ok(())
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        if let Ok(backend) = backend() {
            backend.close(self.handle);
        }
    }
}

/// A transaction that rolls back unless it is committed.
#[derive(Debug)]
pub struct Transaction<'conn> {
    connection: &'conn Connection,
    open: bool,
}

impl<'conn> Transaction<'conn> {
    fn begin(connection: &'conn Connection, behavior: TransactionBehavior) -> Result<Self> {
        let begin = match behavior {
            TransactionBehavior::Deferred => "BEGIN DEFERRED",
            TransactionBehavior::Immediate => "BEGIN IMMEDIATE",
            TransactionBehavior::Exclusive => "BEGIN EXCLUSIVE",
        };
        connection.execute_batch(begin)?;
        Ok(Self {
            connection,
            open: true,
        })
    }

    pub fn commit(mut self) -> Result<()> {
        self.open = false;
        self.connection.execute_batch("COMMIT")
    }

    pub fn rollback(mut self) -> Result<()> {
        self.open = false;
        self.connection.execute_batch("ROLLBACK")
    }
}

impl Deref for Transaction<'_> {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        self.connection
    }
}

impl Drop for Transaction<'_> {
    fn drop(&mut self) {
        if self.open {
            let _ = self.connection.execute_batch("ROLLBACK");
        }
    }
}
