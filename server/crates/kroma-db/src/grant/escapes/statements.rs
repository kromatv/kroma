//! Statement shapes that could launder a read past the grant.

use super::{allowed, fixture, refused, MODULE};
use crate::grant::{init_scoped, Grant};

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
