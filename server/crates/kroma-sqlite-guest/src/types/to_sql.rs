use std::borrow::Cow;
use std::rc::Rc;
use std::sync::Arc;

use super::{Value, ValueRef};
use crate::Result;

/// A NULL to bind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Null;

/// A value on its way in.
#[derive(Debug, Clone, PartialEq)]
pub enum ToSqlOutput<'a> {
    Borrowed(ValueRef<'a>),
    Owned(Value),
}

impl ToSqlOutput<'_> {
    pub(crate) fn into_value(self) -> Value {
        match self {
            Self::Borrowed(value) => value.into(),
            Self::Owned(value) => value,
        }
    }
}

impl<'a, T: Into<Value>> From<T> for ToSqlOutput<'a> {
    fn from(value: T) -> Self {
        Self::Owned(value.into())
    }
}

/// Anything that binds to a statement parameter.
pub trait ToSql {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>>;
}

macro_rules! lossless_into_value {
    ($($t:ty),*) => {$(
        impl From<$t> for Value {
            fn from(value: $t) -> Self {
                Self::Integer(i64::from(value))
            }
        }
    )*};
}
lossless_into_value!(i8, i16, i32, u8, u16, u32, bool, i64);

impl From<f64> for Value {
    fn from(value: f64) -> Self {
        Self::Real(value)
    }
}

impl From<f32> for Value {
    fn from(value: f32) -> Self {
        Self::Real(f64::from(value))
    }
}

impl From<String> for Value {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<&str> for Value {
    fn from(value: &str) -> Self {
        Self::Text(value.to_string())
    }
}

impl From<Vec<u8>> for Value {
    fn from(value: Vec<u8>) -> Self {
        Self::Blob(value)
    }
}

impl From<Null> for Value {
    fn from(_: Null) -> Self {
        Self::Null
    }
}

impl<T: Into<Value>> From<Option<T>> for Value {
    fn from(value: Option<T>) -> Self {
        value.map_or(Self::Null, Into::into)
    }
}

macro_rules! to_sql_by_value {
    ($($t:ty),*) => {$(
        impl ToSql for $t {
            fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::Owned(Value::from(*self)))
            }
        }
    )*};
}
to_sql_by_value!(i8, i16, i32, i64, u8, u16, u32, bool, f32, f64, Null);

macro_rules! to_sql_checked {
    ($($t:ty),*) => {$(
        impl ToSql for $t {
            fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
                let value = i64::try_from(*self)
                    .map_err(|error| crate::Error::ToSqlConversionFailure(Box::new(error)))?;
                Ok(ToSqlOutput::Owned(Value::Integer(value)))
            }
        }
    )*};
}
to_sql_checked!(u64, usize, isize);

impl ToSql for str {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::Text(self.as_bytes())))
    }
}

impl ToSql for String {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        self.as_str().to_sql()
    }
}

impl ToSql for [u8] {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::Blob(self)))
    }
}

impl ToSql for Vec<u8> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        self.as_slice().to_sql()
    }
}

impl<const N: usize> ToSql for [u8; N] {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        self.as_slice().to_sql()
    }
}

impl ToSql for Value {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(self.into()))
    }
}

impl ToSql for ValueRef<'_> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(*self))
    }
}

impl ToSql for ToSqlOutput<'_> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        Ok(match self {
            Self::Borrowed(value) => ToSqlOutput::Borrowed(*value),
            Self::Owned(value) => ToSqlOutput::Borrowed(value.into()),
        })
    }
}

impl<T: ToSql> ToSql for Option<T> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        match self {
            Some(value) => value.to_sql(),
            None => Ok(ToSqlOutput::Owned(Value::Null)),
        }
    }
}

impl<T: ToSql + ?Sized> ToSql for &T {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        (**self).to_sql()
    }
}

impl<T: ToSql + ?Sized> ToSql for Box<T> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        (**self).to_sql()
    }
}

impl<T: ToSql + ?Sized> ToSql for Arc<T> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        (**self).to_sql()
    }
}

impl<T: ToSql + ?Sized> ToSql for Rc<T> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        (**self).to_sql()
    }
}

impl<T: ToSql + ToOwned + ?Sized> ToSql for Cow<'_, T> {
    fn to_sql(&self) -> Result<ToSqlOutput<'_>> {
        self.as_ref().to_sql()
    }
}
