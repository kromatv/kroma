use crate::model::User;

use super::{Filed, Granted, Grants};

pub(super) fn user() -> User {
    crate::test_support::test_user("u1", vec![])
}

pub(super) fn granted() -> Granted {
    Granted {
        token: "tok".into(),
        access_token: "acc".into(),
        user: user(),
    }
}

pub(super) fn grants() -> Grants<&'static str> {
    Grants::new(300, 4)
}

pub(super) fn seq_mint() -> impl FnMut() -> String {
    let mut n = 0;
    move || {
        n += 1;
        format!("h{n}")
    }
}

pub(super) fn file(
    g: &Grants<&'static str>,
    meta: &'static str,
    mint: impl FnMut() -> String,
) -> (String, String) {
    let Filed { handle, secret } = g.insert(meta, mint).expect("room in the store");
    (handle, secret)
}

pub(super) type Scoped = (&'static str, &'static str);

pub(super) fn scope(meta: &Scoped) -> &'static str {
    meta.0
}

pub(super) fn place(g: &Grants<Scoped>, meta: Scoped, mint: impl FnMut() -> String) -> Filed {
    g.replace_scoped(|_| false, scope, 8, meta, mint)
        .filed
        .expect("room in the store")
}
