use super::{create_user, DeviceHints};
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

pub(super) fn ua(user_agent: &str) -> DeviceHints {
    DeviceHints {
        user_agent: Some(user_agent.to_string()),
        language: None,
    }
}

pub(super) fn spoken(user_agent: &str, language: &str) -> DeviceHints {
    DeviceHints {
        user_agent: Some(user_agent.to_string()),
        language: Some(language.to_string()),
    }
}
