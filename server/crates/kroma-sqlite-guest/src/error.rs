use std::fmt;

use crate::types::{FromSqlError, Type};

/// A failed statement, as rusqlite names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum ErrorCode {
    InternalMalfunction,
    PermissionDenied,
    OperationAborted,
    DatabaseBusy,
    DatabaseLocked,
    OutOfMemory,
    ReadOnly,
    OperationInterrupted,
    SystemIoFailure,
    DatabaseCorrupt,
    NotFound,
    DiskFull,
    CannotOpen,
    SchemaChanged,
    TooBig,
    ConstraintViolation,
    TypeMismatch,
    ApiMisuse,
    AuthorizationForStatementDenied,
    Unknown,
}

impl ErrorCode {
    fn of(extended: i32) -> Self {
        match extended & 0xff {
            2 => Self::InternalMalfunction,
            3 => Self::PermissionDenied,
            4 => Self::OperationAborted,
            5 => Self::DatabaseBusy,
            6 => Self::DatabaseLocked,
            7 => Self::OutOfMemory,
            8 => Self::ReadOnly,
            9 => Self::OperationInterrupted,
            10 => Self::SystemIoFailure,
            11 => Self::DatabaseCorrupt,
            12 => Self::NotFound,
            13 => Self::DiskFull,
            14 => Self::CannotOpen,
            17 => Self::SchemaChanged,
            18 => Self::TooBig,
            19 => Self::ConstraintViolation,
            20 => Self::TypeMismatch,
            21 => Self::ApiMisuse,
            23 => Self::AuthorizationForStatementDenied,
            _ => Self::Unknown,
        }
    }
}

/// rusqlite's `ffi`, as far as an error needs it.
pub mod ffi {
    pub use super::ErrorCode;

    pub const SQLITE_CONSTRAINT_UNIQUE: i32 = 2067;
    pub const SQLITE_CONSTRAINT_PRIMARYKEY: i32 = 1555;

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct Error {
        pub code: ErrorCode,
        pub extended_code: i32,
    }

    impl Error {
        pub fn new(extended_code: i32) -> Self {
            Self {
                code: ErrorCode::of(extended_code),
                extended_code,
            }
        }
    }
}

/// A failed call, with rusqlite's variants so a module can match on them.
#[derive(Debug)]
#[non_exhaustive]
pub enum Error {
    SqliteFailure(ffi::Error, Option<String>),
    QueryReturnedNoRows,
    QueryReturnedMoreThanOneRow,
    InvalidColumnIndex(usize),
    InvalidColumnName(String),
    InvalidColumnType(usize, String, Type),
    IntegralValueOutOfRange(usize, i64),
    FromSqlConversionFailure(usize, Type, Box<dyn std::error::Error + Send + Sync + 'static>),
    ToSqlConversionFailure(Box<dyn std::error::Error + Send + Sync + 'static>),
    Utf8Error(usize, std::str::Utf8Error),
    InvalidQuery,
    InvalidParameterCount(usize, usize),
}

/// What every call in this crate returns.
pub type Result<T, E = Error> = std::result::Result<T, E>;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SqliteFailure(error, Some(message)) => {
                write!(f, "{message} (code {})", error.extended_code)
            }
            Self::SqliteFailure(error, None) => write!(f, "sqlite error {}", error.extended_code),
            Self::QueryReturnedNoRows => write!(f, "Query returned no rows"),
            Self::QueryReturnedMoreThanOneRow => write!(f, "Query returned more than one row"),
            Self::InvalidColumnIndex(index) => write!(f, "Invalid column index: {index}"),
            Self::InvalidColumnName(name) => write!(f, "Invalid column name: {name}"),
            Self::InvalidColumnType(index, name, kind) => {
                write!(f, "Invalid column type {kind} at index: {index}, name: {name}")
            }
            Self::IntegralValueOutOfRange(index, value) => {
                write!(f, "Integer {value} out of range at index {index}")
            }
            Self::FromSqlConversionFailure(index, kind, error) => {
                write!(f, "Conversion error from type {kind} at index: {index}, {error}")
            }
            Self::ToSqlConversionFailure(error) => write!(f, "{error}"),
            Self::Utf8Error(index, error) => write!(f, "Invalid UTF-8 at index {index}: {error}"),
            Self::InvalidQuery => write!(f, "Query is not read-only"),
            Self::InvalidParameterCount(given, wanted) => {
                write!(f, "Wrong number of parameters: {given}, expected {wanted}")
            }
        }
    }
}

impl std::error::Error for Error {}

impl Error {
    pub fn sqlite_error(&self) -> Option<&ffi::Error> {
        match self {
            Self::SqliteFailure(error, _) => Some(error),
            _ => None,
        }
    }

    pub fn sqlite_error_code(&self) -> Option<ErrorCode> {
        self.sqlite_error().map(|error| error.code)
    }
}

impl From<crate::backend::Failure> for Error {
    fn from(failure: crate::backend::Failure) -> Self {
        Self::SqliteFailure(ffi::Error::new(failure.code), Some(failure.message))
    }
}

pub(crate) fn of_conversion(error: FromSqlError, index: usize, name: &str, kind: Type) -> Error {
    match error {
        FromSqlError::InvalidType => Error::InvalidColumnType(index, name.to_string(), kind),
        FromSqlError::OutOfRange(value) => Error::IntegralValueOutOfRange(index, value),
        FromSqlError::Other(error) => Error::FromSqlConversionFailure(index, kind, error),
    }
}

/// Turn "no rows" into `None`, as rusqlite does.
pub trait OptionalExtension<T> {
    fn optional(self) -> Result<Option<T>>;
}

impl<T> OptionalExtension<T> for Result<T> {
    fn optional(self) -> Result<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}
