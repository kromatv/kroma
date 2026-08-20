//! Routes through the schema itself: attach, DDL, views, triggers, pragmas.

use super::{fixture, refused};

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
