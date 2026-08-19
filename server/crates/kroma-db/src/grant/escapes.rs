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
fn a_plain_read_of_an_ungranted_table_is_refused() {
    let f = fixture();
    refused(&f.scoped, "SELECT token FROM sessions");
    refused(&f.scoped, "SELECT * FROM sessions");
    refused(&f.scoped, "SELECT count(*) FROM sessions");
    // ...while the granted one still answers, or the scope would be useless.
    allowed(&f.scoped, "SELECT title FROM requests");
}

#[test]
fn a_subquery_is_a_read_like_any_other() {
    let f = fixture();
    refused(&f.scoped, "SELECT (SELECT token FROM sessions LIMIT 1)");
    refused(&f.scoped, "SELECT title FROM requests WHERE id IN (SELECT user_id FROM sessions)");
    refused(&f.scoped, "SELECT title FROM requests WHERE EXISTS (SELECT 1 FROM sessions)");
    refused(
        &f.scoped,
        "SELECT (SELECT token FROM sessions LIMIT 1) AS leak FROM requests",
    );
}

#[test]
fn a_join_does_not_launder_the_other_table() {
    let f = fixture();
    refused(
        &f.scoped,
        "SELECT r.title FROM requests r JOIN sessions s ON s.user_id = r.requested_by",
    );
    refused(
        &f.scoped,
        "SELECT r.title FROM requests r LEFT JOIN users u ON u.id = r.requested_by",
    );
    refused(&f.scoped, "SELECT r.title FROM requests r, sessions s");
}

#[test]
fn a_union_cannot_smuggle_a_second_table_in() {
    let f = fixture();
    refused(&f.scoped, "SELECT title FROM requests UNION SELECT token FROM sessions");
    refused(&f.scoped, "SELECT title FROM requests UNION ALL SELECT token FROM sessions");
    refused(&f.scoped, "SELECT title FROM requests EXCEPT SELECT token FROM sessions");
}

#[test]
fn a_cte_is_not_a_way_round_it() {
    let f = fixture();
    refused(&f.scoped, "WITH s AS (SELECT token FROM sessions) SELECT * FROM s");
    refused(
        &f.scoped,
        "WITH s AS (SELECT token FROM sessions) SELECT r.title FROM requests r, s",
    );
}

#[test]
fn a_write_cannot_carry_an_ungranted_read_with_it() {
    let f = fixture();
    // The classic exfiltration: copy the secret into a table you CAN read.
    refused(
        &f.scoped,
        "UPDATE wanted SET title = (SELECT token FROM sessions LIMIT 1) WHERE id = 'wt1'",
    );
    refused(
        &f.scoped,
        "INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
         SELECT 'wt2','rq1','movie',603,token,'wanted',1 FROM sessions",
    );
    refused(&f.scoped, "DELETE FROM wanted WHERE title IN (SELECT token FROM sessions)");
}

#[test]
fn the_returning_clause_returns_nothing_it_was_not_granted() {
    let f = fixture();
    refused(
        &f.scoped,
        "UPDATE wanted SET status = 'grabbed' WHERE id = 'wt1' \
         RETURNING (SELECT token FROM sessions LIMIT 1)",
    );
}

#[test]
fn attach_is_refused_so_the_same_file_cannot_come_back_under_another_name() {
    // The per-table rules key on a table name in the main schema. Re-opening the
    // same database as `side` would put every row behind a name they never see.
    let f = fixture();
    refused(&f.scoped, "ATTACH DATABASE ':memory:' AS side");
    let path = f.core.path().display().to_string();
    refused(&f.scoped, &format!("ATTACH DATABASE '{path}' AS side"));
    refused(&f.scoped, "DETACH DATABASE main");
}

#[test]
fn no_ddl_at_all_on_a_database_the_module_does_not_own() {
    let f = fixture();
    refused(&f.scoped, "CREATE TABLE mine (id TEXT)");
    refused(&f.scoped, "CREATE TEMP TABLE mine (id TEXT)");
    refused(&f.scoped, "DROP TABLE requests");
    refused(&f.scoped, "ALTER TABLE requests ADD COLUMN sneaky TEXT");
    refused(&f.scoped, "CREATE INDEX idx_sneaky ON requests(title)");
    refused(&f.scoped, "DROP TABLE sessions");
}

#[test]
fn a_view_cannot_be_built_over_an_ungranted_table() {
    // Nor read through one: the authorizer fires for the tables INSIDE a view,
    // with the view named as the accessor, so a view someone else created is
    // checked against this module's grant and not against its author's.
    let f = fixture();
    refused(&f.scoped, "CREATE VIEW leak AS SELECT token FROM sessions");

    f.core
        .get()
        .unwrap()
        .execute_batch("CREATE VIEW all_tokens AS SELECT token FROM sessions")
        .unwrap();
    refused(&f.scoped, "SELECT * FROM all_tokens");
    refused(&f.scoped, "SELECT token FROM all_tokens");
}

#[test]
fn a_trigger_cannot_be_used_to_reach_further_than_the_grant() {
    let f = fixture();
    refused(
        &f.scoped,
        "CREATE TRIGGER leak AFTER UPDATE ON wanted BEGIN \
         UPDATE wanted SET title = (SELECT token FROM sessions LIMIT 1); END",
    );

    // One that already exists is checked when the statement that fires it is
    // prepared, so writing a granted table cannot run ungranted SQL by proxy.
    f.core
        .get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER steal AFTER UPDATE ON wanted BEGIN \
             INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ('X','u1','n',1); END",
        )
        .unwrap();
    refused(&f.scoped, "UPDATE wanted SET status = 'grabbed' WHERE id = 'wt1'");
}

#[test]
fn pragmas_are_refused_including_the_ones_that_read_a_schema() {
    let f = fixture();
    refused(&f.scoped, "PRAGMA table_info(sessions)");
    refused(&f.scoped, "PRAGMA foreign_keys = OFF");
    refused(&f.scoped, "PRAGMA writable_schema = ON");
    refused(&f.scoped, "PRAGMA journal_mode = DELETE");
    // ...and the table-valued spelling of the same thing.
    refused(&f.scoped, "SELECT name FROM pragma_table_info('sessions')");
}

#[test]
fn the_schema_is_readable_and_the_rows_behind_it_are_not() {
    // `sqlite_master` stays readable because denying it breaks rusqlite's own
    // column lookups. It carries DDL, never a row: this pins that the one does
    // not become the other.
    let f = fixture();
    let conn = f.scoped.get().unwrap();
    let n: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master WHERE type='table'", [], |r| r.get(0))
        .unwrap();
    assert!(n > 0, "the schema is readable");

    refused(&f.scoped, "SELECT token FROM sessions");
    // And it is not a back door to the data either.
    refused(&f.scoped, "SELECT sql FROM sqlite_master JOIN sessions");
}

#[test]
fn loading_an_extension_is_refused_before_the_authorizer_even_sees_it() {
    // An extension runs native code inside the process with the connection in
    // hand, which would make every rule above advisory. This one is refused by
    // a second mechanism entirely -- extension loading is off at the connection
    // level, so the function does not resolve -- which is why it does not come
    // back as an authorizer denial like everything else here.
    // It is also the one refusal that lands at RUN time rather than at prepare:
    // the function resolves, and calling it is what fails.
    let f = fixture();
    let call = "SELECT load_extension('/tmp/evil.dylib')";
    for (which, pool) in [("scoped", &f.scoped), ("core", &f.core)] {
        let conn = pool.get().unwrap();
        let err = conn
            .query_row(call, [], |_| Ok(()))
            .expect_err("extension loading must not be reachable")
            .to_string();
        assert!(err.contains("not authorized"), "{which}: {err}");
    }
}

#[test]
fn a_write_grant_is_not_a_read_grant_and_the_reverse() {
    let f = fixture();
    // `requests` is readable, not writable.
    refused(&f.scoped, "UPDATE requests SET title = 'x' WHERE id = 'rq1'");
    refused(&f.scoped, "DELETE FROM requests WHERE id = 'rq1'");
    refused(
        &f.scoped,
        "INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
         VALUES ('rq2','movie',1,'x','approved',1,1)",
    );
    // `wanted` is both, which is what the module declared.
    allowed(&f.scoped, "UPDATE wanted SET status = 'grabbed' WHERE id = 'wt1'");
}

#[test]
fn a_column_grant_holds_across_every_place_a_column_is_reached() {
    let f = fixture();
    let path = f.core.path().to_path_buf();
    let narrow = init_scoped(
        &path,
        MODULE,
        &Grant { read: vec!["users.username".into()], write: Vec::new() },
    )
    .unwrap();

    allowed(&narrow, "SELECT username FROM users");
    // Projected, filtered, ordered, grouped, aggregated: all reads.
    refused(&narrow, "SELECT password_hash FROM users");
    refused(&narrow, "SELECT username FROM users WHERE password_hash = 'x'");
    refused(&narrow, "SELECT username FROM users ORDER BY password_hash");
    refused(&narrow, "SELECT username FROM users GROUP BY password_hash");
    refused(&narrow, "SELECT max(password_hash) FROM users");
    refused(&narrow, "SELECT u.password_hash AS pw FROM users u");
    refused(&narrow, "SELECT * FROM users");
}

#[test]
fn the_empty_grant_is_the_default_and_it_answers_nothing() {
    // What a module with no declared `storage.core` is handed. It must be a pool
    // that refuses, never an unscoped one.
    let f = fixture();
    let none = init_scoped(f.core.path(), "tv.kroma.vpn", &Grant::none()).unwrap();
    for sql in [
        "SELECT token FROM sessions",
        "SELECT title FROM requests",
        "SELECT id FROM users",
        "SELECT count(*) FROM sqlite_master WHERE 1 = (SELECT count(*) FROM users)",
    ] {
        refused(&none, sql);
    }
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
