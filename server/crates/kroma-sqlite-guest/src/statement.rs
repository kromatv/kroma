use std::sync::Arc;

use crate::connection::Connection;
use crate::error::of_conversion;
use crate::params::Params;
use crate::types::{FromSql, Value, ValueRef};
use crate::{Error, Result};

/// A statement to run. The host prepares it on each run and caches it there.
#[derive(Debug)]
pub struct Statement<'conn> {
    connection: &'conn Connection,
    sql: String,
    columns: Vec<String>,
}

impl<'conn> Statement<'conn> {
    pub(crate) fn new(connection: &'conn Connection, sql: &str) -> Self {
        Self {
            connection,
            sql: sql.to_string(),
            columns: Vec::new(),
        }
    }

    pub fn execute<P: Params>(&mut self, params: P) -> Result<usize> {
        let outcome = self.connection.run(&self.sql, params.values()?)?;
        Ok(usize::try_from(outcome.changes).unwrap_or(usize::MAX))
    }

    pub fn insert<P: Params>(&mut self, params: P) -> Result<i64> {
        self.execute(params)?;
        Ok(self.connection.last_insert_rowid())
    }

    pub fn query<P: Params>(&mut self, params: P) -> Result<Rows<'_>> {
        let outcome = self.connection.run(&self.sql, params.values()?)?;
        self.columns.clone_from(&outcome.columns);
        Ok(Rows {
            columns: Arc::new(outcome.columns),
            rows: outcome.rows.into_iter(),
            current: None,
            lifetime: std::marker::PhantomData,
        })
    }

    pub fn query_map<T, P, F>(&mut self, params: P, f: F) -> Result<MappedRows<'_, F>>
    where
        P: Params,
        F: FnMut(&Row<'_>) -> Result<T>,
    {
        Ok(MappedRows {
            rows: self.query(params)?,
            map: f,
        })
    }

    pub fn query_and_then<T, E, P, F>(&mut self, params: P, f: F) -> Result<AndThenRows<'_, F>>
    where
        P: Params,
        E: From<Error>,
        F: FnMut(&Row<'_>) -> Result<T, E>,
    {
        Ok(AndThenRows {
            rows: self.query(params)?,
            map: f,
        })
    }

    pub fn query_row<T, P, F>(&mut self, params: P, f: F) -> Result<T>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> Result<T>,
    {
        let mut rows = self.query(params)?;
        let row = rows.next()?.ok_or(Error::QueryReturnedNoRows)?;
        f(row)
    }

    pub fn exists<P: Params>(&mut self, params: P) -> Result<bool> {
        let mut rows = self.query(params)?;
        Ok(rows.next()?.is_some())
    }

    pub fn column_count(&self) -> usize {
        self.columns.len()
    }

    /// Known once this statement has run, because the host prepares it then.
    pub fn column_names(&self) -> Vec<&str> {
        self.columns.iter().map(String::as_str).collect()
    }
}

/// The rows a statement answered with, already here.
pub struct Rows<'stmt> {
    columns: Arc<Vec<String>>,
    rows: std::vec::IntoIter<Vec<Value>>,
    current: Option<Row<'stmt>>,
    lifetime: std::marker::PhantomData<&'stmt ()>,
}

impl<'stmt> Rows<'stmt> {
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> Result<Option<&Row<'stmt>>> {
        self.current = self.rows.next().map(|values| Row {
            columns: Arc::clone(&self.columns),
            values,
            lifetime: std::marker::PhantomData,
        });
        Ok(self.current.as_ref())
    }

    pub fn mapped<T, F>(self, map: F) -> MappedRows<'stmt, F>
    where
        F: FnMut(&Row<'_>) -> Result<T>,
    {
        MappedRows { rows: self, map }
    }

    pub fn and_then<T, E, F>(self, map: F) -> AndThenRows<'stmt, F>
    where
        E: From<Error>,
        F: FnMut(&Row<'_>) -> Result<T, E>,
    {
        AndThenRows { rows: self, map }
    }
}

/// Rows through a closure, as [`Statement::query_map`] answers.
pub struct MappedRows<'stmt, F> {
    rows: Rows<'stmt>,
    map: F,
}

impl<T, F> Iterator for MappedRows<'_, F>
where
    F: FnMut(&Row<'_>) -> Result<T>,
{
    type Item = Result<T>;

    fn next(&mut self) -> Option<Result<T>> {
        let map = &mut self.map;
        self.rows.next().transpose().map(|row| row.and_then(map))
    }
}

/// Rows through a fallible closure, as [`Statement::query_and_then`] answers.
pub struct AndThenRows<'stmt, F> {
    rows: Rows<'stmt>,
    map: F,
}

impl<T, E, F> Iterator for AndThenRows<'_, F>
where
    E: From<Error>,
    F: FnMut(&Row<'_>) -> Result<T, E>,
{
    type Item = Result<T, E>;

    fn next(&mut self) -> Option<Result<T, E>> {
        let map = &mut self.map;
        self.rows
            .next()
            .transpose()
            .map(|row| row.map_err(E::from).and_then(map))
    }
}

/// One row.
#[derive(Debug)]
pub struct Row<'stmt> {
    columns: Arc<Vec<String>>,
    values: Vec<Value>,
    lifetime: std::marker::PhantomData<&'stmt ()>,
}

/// What names a column: its position or its name.
pub trait RowIndex {
    #[doc(hidden)]
    fn index_in(&self, columns: &[String]) -> Result<usize>;
}

impl RowIndex for usize {
    fn index_in(&self, columns: &[String]) -> Result<usize> {
        if *self < columns.len() {
            Ok(*self)
        } else {
            Err(Error::InvalidColumnIndex(*self))
        }
    }
}

impl RowIndex for &str {
    fn index_in(&self, columns: &[String]) -> Result<usize> {
        columns
            .iter()
            .position(|column| column.eq_ignore_ascii_case(self))
            .ok_or_else(|| Error::InvalidColumnName((*self).to_string()))
    }
}

impl Row<'_> {
    pub fn get<I: RowIndex, T: FromSql>(&self, index: I) -> Result<T> {
        let at = index.index_in(&self.columns)?;
        let value = ValueRef::from(&self.values[at]);
        T::column_result(value).map_err(|error| of_conversion(error, at, &self.columns[at], value.data_type()))
    }

    pub fn get_ref<I: RowIndex>(&self, index: I) -> Result<ValueRef<'_>> {
        let at = index.index_in(&self.columns)?;
        Ok(ValueRef::from(&self.values[at]))
    }

    #[track_caller]
    pub fn get_unwrap<I: RowIndex, T: FromSql>(&self, index: I) -> T {
        self.get(index).expect("a column that reads as the asked type")
    }
}
