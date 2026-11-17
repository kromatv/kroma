use rusqlite::Connection;

use crate::schema::{init, legacy_database};
use crate::{session_user, user_by_id, Pool};

const FUTURE: i64 = 9_999_999_999;

fn a_household_before_the_step(path: &std::path::Path) {
    let old = legacy_database(path);
    old.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO users (id,email,username,password_hash,created_at,libraries) \
                 VALUES ('u1','Ana@Test.dev','ana','hash','2026-01-01T00:00:00Z','[\"films\"]'), \
                        ('u2','bo@test.dev','bo','hash','2026-01-02T00:00:00Z',NULL); \
             INSERT INTO sessions (token,user_id,created_at,expires_at) \
                 VALUES ('session-bearer','u1','n',{FUTURE}); \
             INSERT INTO invites (token,created_by,created_at,expires_at) \
                 VALUES ('inv','u1','n',{FUTURE}); \
             PRAGMA foreign_keys = OFF; \
             INSERT INTO progress (user_id,item_id,position_ms,updated_at) \
                 VALUES ('u1','a-title-not-scanned-yet',1000,'n'); \
             PRAGMA foreign_keys = ON;"
        ))
        .unwrap();
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn upgraded(tag: &str, before: impl FnOnce(&std::path::Path)) -> (Pool, kroma_testing::TempDir) {
    let dir = kroma_testing::temp_dir(tag);
    let path = dir.path().join("kroma.db");
    before(&path);
    (init(&path).unwrap(), dir)
}

#[test]
fn every_account_and_what_points_at_it_is_still_there_after_the_step() {
    let (pool, _dir) = upgraded("waiting-step-keeps", a_household_before_the_step);

    let ana = user_by_id(&pool, "u1").unwrap().unwrap();

    assert_eq!(ana.email, "Ana@Test.dev");
    assert_eq!(
        ana.libraries,
        kroma_domain::LibraryScope::Only(vec!["films".into()])
    );
    assert_eq!(
        session_user(&pool, "session-bearer").unwrap().unwrap().id,
        "u1"
    );
    let conn = pool.get().unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM users WHERE waiting = 0"), 2);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM progress"), 1);
    assert_eq!(
        count(
            &conn,
            "SELECT COUNT(*) FROM invites WHERE created_by = 'u1' AND user_id IS NULL"
        ),
        1
    );
}

#[test]
fn a_database_whose_names_were_never_made_unique_still_upgrades() {
    let (pool, _dir) = upgraded("waiting-step-names", |path| {
        let old = legacy_database(path);
        old.get()
            .unwrap()
            .execute_batch(
                "DROP INDEX idx_users_username; \
                 INSERT INTO users (id,email,username,password_hash,created_at) \
                     VALUES ('u1','a@test.dev','sam','hash','t'), \
                            ('u2','b@test.dev','sam','hash','t');",
            )
            .unwrap();
    });

    let conn = pool.get().unwrap();

    assert_eq!(count(&conn, "SELECT COUNT(*) FROM users"), 2);
    assert_eq!(
        count(
            &conn,
            "SELECT COUNT(*) FROM sqlite_schema WHERE name = 'idx_users_username'"
        ),
        0
    );
}

#[test]
fn only_an_account_that_waits_may_be_without_an_address() {
    let pool = crate::testing::temp_pool("waiting-step-address");
    let conn = pool.get().unwrap();

    let settled = conn.execute(
        "INSERT INTO users (id,email,username,password_hash,created_at) \
         VALUES ('u1',NULL,'ana','hash','t')",
        [],
    );
    let waiting = conn.execute_batch(
        "INSERT INTO users (id,email,username,password_hash,created_at,waiting) \
             VALUES ('u2',NULL,'bo','','t',1), ('u3',NULL,'cy','','t',1);",
    );

    assert!(settled.is_err());
    assert!(waiting.is_ok());
}

#[test]
fn an_account_has_one_unused_invitation_at_most() {
    let pool = crate::testing::temp_pool("waiting-step-invite");
    let conn = pool.get().unwrap();
    conn.execute_batch(&format!(
        "INSERT INTO users (id,email,username,password_hash,created_at,waiting) \
             VALUES ('u1',NULL,'ana','','t',1); \
         INSERT INTO invites (token,created_at,expires_at,user_id) VALUES ('first','t',{FUTURE},'u1');"
    ))
    .unwrap();

    let second = conn.execute(
        "INSERT INTO invites (token,created_at,expires_at,user_id) VALUES ('second','t',?1,'u1')",
        [FUTURE],
    );

    assert!(second.is_err());
}
