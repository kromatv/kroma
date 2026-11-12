use std::sync::Arc;

use super::{FromSqlError, FromSqlResult, Value, ValueRef};

/// Anything a column reads into.
pub trait FromSql: Sized {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self>;
}

macro_rules! from_sql_integer {
    ($($t:ty),*) => {$(
        impl FromSql for $t {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                let wide = value.as_i64()?;
                <$t>::try_from(wide).map_err(|_| FromSqlError::OutOfRange(wide))
            }
        }
    )*};
}
from_sql_integer!(i8, i16, i32, u8, u16, u32, u64, usize, isize);

impl FromSql for i64 {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_i64()
    }
}

impl FromSql for f64 {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Integer(i) => Ok(i as Self),
            ValueRef::Real(r) => Ok(r),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}

impl FromSql for f32 {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        f64::column_result(value).map(|wide| wide as Self)
    }
}

impl FromSql for bool {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_i64().map(|i| i != 0)
    }
}

impl FromSql for String {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str().map(ToString::to_string)
    }
}

impl FromSql for Box<str> {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str().map(Into::into)
    }
}

impl FromSql for Arc<str> {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str().map(Into::into)
    }
}

impl FromSql for Vec<u8> {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_blob().map(<[u8]>::to_vec)
    }
}

impl FromSql for Value {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        Ok(value.into())
    }
}

impl<T: FromSql> FromSql for Option<T> {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Null => Ok(None),
            present => T::column_result(present).map(Some),
        }
    }
}
