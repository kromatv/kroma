use crate::types::{ToSql, Value};
use crate::Result;

/// What a statement's parameters can be spelled as.
pub trait Params {
    #[doc(hidden)]
    fn values(self) -> Result<Vec<Value>>;
}

fn value_of<T: ToSql + ?Sized>(param: &T) -> Result<Value> {
    param.to_sql().map(crate::types::ToSqlOutput::into_value)
}

impl Params for () {
    fn values(self) -> Result<Vec<Value>> {
        Ok(Vec::new())
    }
}

impl Params for &[&dyn ToSql] {
    fn values(self) -> Result<Vec<Value>> {
        self.iter().map(|param| value_of(*param)).collect()
    }
}

impl Params for [&(dyn ToSql + Send + Sync); 0] {
    fn values(self) -> Result<Vec<Value>> {
        Ok(Vec::new())
    }
}

impl Params for &[&(dyn ToSql + Send + Sync); 0] {
    fn values(self) -> Result<Vec<Value>> {
        Ok(Vec::new())
    }
}

macro_rules! arrays {
    ($($n:literal)*) => {$(
        impl<T: ToSql> Params for [T; $n] {
            fn values(self) -> Result<Vec<Value>> {
                self.iter().map(value_of).collect()
            }
        }

        impl<T: ToSql> Params for &[T; $n] {
            fn values(self) -> Result<Vec<Value>> {
                self.iter().map(value_of).collect()
            }
        }
    )*};
}
arrays!(1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32);

macro_rules! tuples {
    ($(($($name:ident)+))*) => {$(
        impl<$($name: ToSql),+> Params for ($($name,)+) {
            #[allow(non_snake_case)]
            fn values(self) -> Result<Vec<Value>> {
                let ($($name,)+) = self;
                Ok(vec![$(value_of(&$name)?),+])
            }
        }
    )*};
}
tuples! {
    (A)
    (A B)
    (A B C)
    (A B C D)
    (A B C D E)
    (A B C D E F)
    (A B C D E F G)
    (A B C D E F G H)
    (A B C D E F G H I)
    (A B C D E F G H I J)
    (A B C D E F G H I J K)
    (A B C D E F G H I J K L)
    (A B C D E F G H I J K L M)
    (A B C D E F G H I J K L M N)
    (A B C D E F G H I J K L M N O)
    (A B C D E F G H I J K L M N O P)
}

/// Parameters read from an iterator.
pub struct ParamsFromIter<I>(I);

/// Bind every item `iter` yields, in order.
pub fn params_from_iter<I>(iter: I) -> ParamsFromIter<I>
where
    I: IntoIterator,
    I::Item: ToSql,
{
    ParamsFromIter(iter)
}

impl<I> Params for ParamsFromIter<I>
where
    I: IntoIterator,
    I::Item: ToSql,
{
    fn values(self) -> Result<Vec<Value>> {
        self.0.into_iter().map(|param| value_of(&param)).collect()
    }
}
