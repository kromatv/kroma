//! Adversarial cover for [`super::Grant`]: everything a module might reach for
//! to read a row it was not granted.
//!
//! The grant is the whole reason a module no longer gets the raw pool, so the
//! interesting question is not "does the happy path work" but "what gets past
//! it". Each test here is one route to ungranted data, and the answer must be
//! the same for all of them: the statement fails at `prepare`, before a row is
//! read. A subquery, a join, a `UNION`, a view, a trigger and an `ATTACH` all
//! reach the same rows a plain `SELECT` would, so they all have to be checked
//! by the same authorizer, and this file is the proof that they are.
//!
//! `sessions` is the target throughout: its `token` column is the one row of
//! data that turns into someone else's account.

use super::{init_scoped, Grant};
use crate::Pool;

mod schema;
mod statements;


const MODULE: &str = "tv.kroma.hostile";

// What the acquisition module actually holds: the request ledger, and nothing
// that identifies or authenticates anyone.
fn granted() -> Grant {
    Grant {
        read: vec!["requests".into(), "wanted".into()],
        write: vec!["wanted".into()],
    }
}

struct Fixture {
    _dir: kroma_testing::TempDir,
    core: Pool,
    scoped: Pool,
}

fn fixture() -> Fixture {
    let dir = kroma_testing::temp_dir("grant-escapes");
    let path = dir.path().join("kroma.db");
    let core = crate::init(&path).expect("core schema");
    core.get()
        .unwrap()
        .execute_batch(
            "INSERT INTO users (id,email,username,password_hash,created_at,permissions) \
             VALUES ('u1','ana@t.dev','ana','SECRET-HASH','now','[\"playback\"]');
             INSERT INTO sessions (token,user_id,created_at,expires_at) \
             VALUES ('SECRET-TOKEN','u1','now',99999999999);
             INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES ('rq1','movie',603,'The Matrix','approved',1,1);
             INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
             VALUES ('wt1','rq1','movie',603,'The Matrix','wanted',1);",
        )
        .unwrap();
    let scoped = init_scoped(&path, MODULE, &granted()).expect("scope");
    Fixture { _dir: dir, core, scoped }
}

// Every route below must fail, it must fail HERE rather than by returning
// something, and it must fail because the AUTHORIZER refused it. The last part
// is what makes these tests worth having: SQLite errors for plenty of reasons,
// and a test that accepts any error would pass just as happily on a typo.
#[track_caller]
fn refused(pool: &Pool, sql: &str) {
    let conn = pool.get().unwrap();
    let err = conn
        .prepare(sql)
        .map(|_| ())
        .and_then(|()| conn.execute_batch(sql))
        .expect_err(&format!("the grant let this through: {sql}"));
    let denied = matches!(
        &err,
        rusqlite::Error::SqliteFailure(e, _)
            if e.code == rusqlite::ErrorCode::AuthorizationForStatementDenied
    );
    assert!(denied, "refused for the wrong reason ({err}): {sql}");
}

#[track_caller]
fn allowed(pool: &Pool, sql: &str) {
    let conn = pool.get().unwrap();
    assert!(conn.prepare(sql).is_ok(), "the grant should cover this: {sql}");
}

#[test]
fn every_connection_the_pool_hands_out_carries_the_scope() {
    // The pool reuses idle connections and opens new ones under load. A scope
    // installed on only the first would be no scope at all.
    let f = fixture();
    for _ in 0..3 {
        let conn = f.scoped.get().unwrap();
        assert!(conn.prepare("SELECT token FROM sessions").is_err());
        drop(conn); // back to the idle set, to be handed out again
    }
    // Several checked out at once, so at least one is freshly opened.
    let held: Vec<_> = (0..4).map(|_| f.scoped.get().unwrap()).collect();
    for conn in &held {
        assert!(
            conn.prepare("SELECT token FROM sessions").is_err(),
            "a connection escaped the scope"
        );
    }
}

#[test]
fn the_core_pool_over_the_same_file_is_not_scoped() {
    // The other half of the property: the app is not scoped against itself, and
    // a module's grant does not leak onto the core's own pool.
    let f = fixture();
    let token: String = f
        .core
        .get()
        .unwrap()
        .query_row("SELECT token FROM sessions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(token, "SECRET-TOKEN");
}

#[test]
fn a_denial_names_what_it_refused() {
    // Three layers down a module's data access, "not authorized" is not enough
    // to act on. The message has to say which table.
    let f = fixture();
    let conn = f.scoped.get().unwrap();
    let err = conn.prepare("SELECT token FROM sessions").unwrap_err().to_string();
    assert!(err.contains("sessions"), "the refusal must name the table: {err}");
    assert!(err.contains("token"), "and the column: {err}");
}
