//! The values that cross to the host, and the conversions rusqlite offers on them.

use std::fmt;

mod from_sql;
mod to_sql;

pub use from_sql::FromSql;
pub use to_sql::{Null, ToSql, ToSqlOutput};

/// A column's storage class.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Type {
    Null,
    Integer,
    Real,
    Text,
    Blob,
}

impl fmt::Display for Type {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Null => "Null",
            Self::Integer => "Integer",
            Self::Real => "Real",
            Self::Text => "Text",
            Self::Blob => "Blob",
        })
    }
}

/// An owned SQLite value.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

/// A borrowed SQLite value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ValueRef<'a> {
    Null,
    Integer(i64),
    Real(f64),
    Text(&'a [u8]),
    Blob(&'a [u8]),
}

impl Value {
    pub fn data_type(&self) -> Type {
        match self {
            Self::Null => Type::Null,
            Self::Integer(_) => Type::Integer,
            Self::Real(_) => Type::Real,
            Self::Text(_) => Type::Text,
            Self::Blob(_) => Type::Blob,
        }
    }
}

impl<'a> From<&'a Value> for ValueRef<'a> {
    fn from(value: &'a Value) -> Self {
        match value {
            Value::Null => Self::Null,
            Value::Integer(i) => Self::Integer(*i),
            Value::Real(r) => Self::Real(*r),
            Value::Text(t) => Self::Text(t.as_bytes()),
            Value::Blob(b) => Self::Blob(b),
        }
    }
}

impl From<ValueRef<'_>> for Value {
    fn from(value: ValueRef<'_>) -> Self {
        match value {
            ValueRef::Null => Self::Null,
            ValueRef::Integer(i) => Self::Integer(i),
            ValueRef::Real(r) => Self::Real(r),
            ValueRef::Text(t) => Self::Text(String::from_utf8_lossy(t).into_owned()),
            ValueRef::Blob(b) => Self::Blob(b.to_vec()),
        }
    }
}

impl<'a> ValueRef<'a> {
    pub fn data_type(&self) -> Type {
        match self {
            Self::Null => Type::Null,
            Self::Integer(_) => Type::Integer,
            Self::Real(_) => Type::Real,
            Self::Text(_) => Type::Text,
            Self::Blob(_) => Type::Blob,
        }
    }

    pub fn as_i64(&self) -> FromSqlResult<i64> {
        match self {
            Self::Integer(i) => Ok(*i),
            _ => Err(FromSqlError::InvalidType),
        }
    }

    pub fn as_i64_or_null(&self) -> FromSqlResult<Option<i64>> {
        match self {
            Self::Null => Ok(None),
            Self::Integer(i) => Ok(Some(*i)),
            _ => Err(FromSqlError::InvalidType),
        }
    }

    pub fn as_f64(&self) -> FromSqlResult<f64> {
        match self {
            Self::Real(r) => Ok(*r),
            _ => Err(FromSqlError::InvalidType),
        }
    }

    pub fn as_str(&self) -> FromSqlResult<&'a str> {
        match self {
            Self::Text(t) => std::str::from_utf8(t).map_err(|error| FromSqlError::Other(Box::new(error))),
            _ => Err(FromSqlError::InvalidType),
        }
    }

    pub fn as_blob(&self) -> FromSqlResult<&'a [u8]> {
        match self {
            Self::Blob(b) => Ok(b),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}

/// Why a column would not convert.
#[derive(Debug)]
#[non_exhaustive]
pub enum FromSqlError {
    InvalidType,
    OutOfRange(i64),
    Other(Box<dyn std::error::Error + Send + Sync + 'static>),
}

impl fmt::Display for FromSqlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidType => f.write_str("invalid type"),
            Self::OutOfRange(value) => write!(f, "value {value} out of range"),
            Self::Other(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for FromSqlError {}

pub type FromSqlResult<T> = std::result::Result<T, FromSqlError>;
