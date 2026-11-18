use super::{create_user, create_waiting_account, Awaited, DeviceHints, WaitingAccount};
use crate::testing::TempPool;
use crate::Pool;
use kroma_domain::{LibraryScope, Permission, User};

pub(super) const FUTURE: i64 = 9_999_999_999;
pub(super) const FILMS: &str = "films";

pub(super) fn films() -> LibraryScope {
    LibraryScope::Only(vec![FILMS.into()])
}

pub(super) fn waiting(pool: &Pool, username: &str, email: Option<&str>) -> User {
    let account = WaitingAccount {
        username,
        email,
        libraries: &films(),
    };
    match create_waiting_account(pool, &account).unwrap() {
        Awaited::Account(user) => *user,
        other => panic!("{username} should wait, got {other:?}"),
    }
}

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
        ..Default::default()
    }
}

pub(super) fn spoken(user_agent: &str, language: &str) -> DeviceHints {
    DeviceHints {
        user_agent: Some(user_agent.to_string()),
        language: Some(language.to_string()),
        ..Default::default()
    }
}
