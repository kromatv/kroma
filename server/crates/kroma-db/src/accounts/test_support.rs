use super::create_user;
use crate::testing::TempPool;
use crate::Pool;
use kroma_domain::{Permission, User};

pub(super) const FUTURE: i64 = 9_999_999_999;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("acct")
}

pub(super) fn mk_user(pool: &Pool, email: &str, username: &str) -> User {
    create_user(pool, email, username, "hash", &[Permission::Playback]).unwrap()
}
