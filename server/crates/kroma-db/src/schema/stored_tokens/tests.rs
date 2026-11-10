use rusqlite::params;

use crate::{
    access_token_user, access_token_user_by_id, list_access_tokens, session_device_id, session_user,
};

const FUTURE: i64 = 9_999_999_999;

fn signed_in_before_the_step(pool: &crate::Pool) {
    let conn = pool.get().unwrap();
    conn.execute_batch(
        "INSERT INTO users (id,email,username,password_hash,created_at) \
         VALUES ('u1','a@b.c','ana','hash','2026-01-01T00:00:00Z');",
    )
    .unwrap();
    conn.execute(
        "INSERT INTO access_tokens (token,user_id,created_at,expires_at) VALUES ('device-bearer','u1','n',?1)",
        params![FUTURE],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO sessions (token,user_id,created_at,expires_at,access_token) \
         VALUES ('session-bearer','u1','n',?1,'device-bearer')",
        params![FUTURE],
    )
    .unwrap();
}

fn stored(pool: &crate::Pool, sql: &str) -> Vec<String> {
    let conn = pool.get().unwrap();
    let mut stmt = conn.prepare(sql).unwrap();
    let rows = stmt.query_map([], |r| r.get(0)).unwrap();
    rows.collect::<rusqlite::Result<Vec<String>>>().unwrap()
}

#[test]
fn a_device_signed_in_before_the_step_stays_signed_in_after_it() {
    let pool = crate::testing::temp_pool("stored-tokens");
    signed_in_before_the_step(&pool);

    super::hash_bearers(&pool.get().unwrap()).unwrap();

    assert_eq!(
        session_user(&pool, "session-bearer").unwrap().unwrap().id,
        "u1"
    );
    assert_eq!(
        access_token_user(&pool, "device-bearer")
            .unwrap()
            .unwrap()
            .0
            .id,
        "u1"
    );
    let id = kroma_primitives::short_hash("device-bearer");
    assert_eq!(
        session_device_id(&pool, "session-bearer").unwrap(),
        Some(id.clone())
    );
    assert_eq!(list_access_tokens(&pool, "u1").unwrap()[0].id, id);
    assert_eq!(
        access_token_user_by_id(&pool, &id).unwrap().unwrap().id,
        "u1"
    );
}

#[test]
fn no_bearer_is_left_in_the_database_after_the_step() {
    let pool = crate::testing::temp_pool("stored-tokens-gone");
    signed_in_before_the_step(&pool);

    super::hash_bearers(&pool.get().unwrap()).unwrap();

    let kept: Vec<String> = [
        stored(&pool, "SELECT token FROM access_tokens"),
        stored(&pool, "SELECT token FROM sessions"),
        stored(&pool, "SELECT access_token FROM sessions"),
    ]
    .concat();
    assert_eq!(kept.len(), 3);
    assert!(kept
        .iter()
        .all(|value| value.len() == 64 && !value.contains("bearer")));
}
