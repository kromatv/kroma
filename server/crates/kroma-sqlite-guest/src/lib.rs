//! The part of rusqlite's API a module is written against, for a WebAssembly
//! component. There is no SQLite in the component: every statement goes through a
//! [`Backend`] to the host, which holds the file and enforces the storage grant.
//!
//! A crate that uses `rusqlite` natively depends on this one under the same name
//! on `wasm32`, so the code that runs the SQL does not change.

mod backend;
mod connection;
mod error;
mod params;
mod statement;
pub mod types;

#[cfg(test)]
mod tests;

pub use backend::{set_backend, Backend, Failure, Outcome};
pub use connection::{Connection, Transaction, TransactionBehavior};
pub use error::{ffi, Error, ErrorCode, OptionalExtension, Result};
pub use params::{params_from_iter, Params, ParamsFromIter};
pub use statement::{AndThenRows, MappedRows, Row, RowIndex, Rows, Statement};
pub use types::{Null, ToSql};

/// A list of parameters of different types, as rusqlite spells it.
#[macro_export]
macro_rules! params {
    () => {
        &[] as &[&dyn $crate::ToSql]
    };
    ($($param:expr),+ $(,)?) => {
        &[$(&$param as &dyn $crate::ToSql),+] as &[&dyn $crate::ToSql]
    };
}
