use super::{allows, init_scoped, Grant};

fn core(tag: &str) -> (crate::testing::TempPool, std::path::PathBuf) {
    let pool = crate::testing::temp_pool(tag);
    let path = pool.path().to_path_buf();
    pool.get()
        .unwrap()
        .execute_batch(
            "INSERT INTO users (id,email,username,password_hash,created_at,permissions) \
             VALUES ('u1','a@b.c','ana','h','now','[\"playback\"]');
             INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES ('rq1','movie',603,'The Matrix','approved',1,1);",
        )
        .unwrap();
    (pool, path)
}

fn grant(read: &[&str], write: &[&str]) -> Grant {
    Grant {
        read: read.iter().map(ToString::to_string).collect(),
        write: write.iter().map(ToString::to_string).collect(),
    }
}

#[test]
fn a_granted_table_reads_and_an_ungranted_one_does_not() {
    let (_keep, path) = core("grant-read");
    let pool = init_scoped(&path, "tv.kroma.acquisition", &grant(&["requests"], &[])).unwrap();
    let conn = pool.get().unwrap();

    let title: String =
        conn.query_row("SELECT title FROM requests WHERE id='rq1'", [], |r| r.get(0)).unwrap();
    assert_eq!(title, "The Matrix");

    // The session tokens and account rows a VPN sidecar used to be able to
    // read for free are exactly what an undeclared table now costs, and the
    // refusal names what it refused.
    let err = conn
        .query_row("SELECT email FROM users WHERE id='u1'", [], |r| r.get::<_, String>(0))
        .unwrap_err();
    assert!(format!("{err}").contains("users.email"), "{err}");
}

#[test]
fn a_column_grant_stops_at_the_column() {
    let (_keep, path) = core("grant-column");
    let pool = init_scoped(&path, "m", &grant(&["users.username", "users.id"], &[])).unwrap();
    let conn = pool.get().unwrap();

    let name: String =
        conn.query_row("SELECT username FROM users WHERE id='u1'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "ana");

    assert!(conn
        .query_row("SELECT email FROM users WHERE id='u1'", [], |r| r.get::<_, String>(0))
        .is_err());
    // A column is reached by a WHERE as much as by a projection, so a
    // predicate on an ungranted one is refused too.
    assert!(conn.prepare("SELECT username FROM users WHERE email = 'a@b.c'").is_err());
    // `SELECT *` reaches every column, so it fails on the first ungranted one.
    assert!(conn.prepare("SELECT * FROM users").is_err());
}

#[test]
fn reading_is_not_writing() {
    let (_keep, path) = core("grant-write");
    let pool = init_scoped(&path, "m", &grant(&["requests"], &[])).unwrap();
    let conn = pool.get().unwrap();

    assert!(conn.execute("UPDATE requests SET title='x' WHERE id='rq1'", []).is_err());
    assert!(conn.execute("DELETE FROM requests WHERE id='rq1'", []).is_err());
}

#[test]
fn a_write_grant_covers_the_three_verbs() {
    let (_keep, path) = core("grant-verbs");
    let pool = init_scoped(&path, "m", &grant(&["acq_file_tmdb"], &["acq_file_tmdb"])).unwrap();
    let conn = pool.get().unwrap();

    conn.execute("INSERT INTO acq_file_tmdb (abs_path, tmdb_id) VALUES ('/a.mkv', 603)", [])
        .unwrap();
    conn.execute("UPDATE acq_file_tmdb SET tmdb_id = 604 WHERE abs_path = '/a.mkv'", [])
        .unwrap();
    conn.execute("DELETE FROM acq_file_tmdb WHERE abs_path = '/a.mkv'", []).unwrap();
}

#[test]
fn a_foreign_key_pulls_its_other_table_into_the_grant() {
    // `PRAGMA foreign_keys = ON` makes a constraint check a real read of the
    // parent, and a cascade a real delete from the child -- so neither side
    // of a foreign key is reachable on a grant that names only one table.
    // Pinned because it is the one rule the manifest does not show: a module
    // writing `wanted` must also declare that it reads `requests`.
    let (_keep, path) = core("grant-fk");
    let insert = "INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
                  VALUES ('wt1','rq1','movie',603,'The Matrix','wanted',1)";

    let write_only = init_scoped(&path, "m", &grant(&[], &["wanted"])).unwrap();
    assert!(write_only.get().unwrap().execute(insert, []).is_err());

    let with_parent = init_scoped(&path, "m", &grant(&["requests.id"], &["wanted"])).unwrap();
    with_parent.get().unwrap().execute(insert, []).unwrap();

    // ON DELETE CASCADE: removing the parent writes the child.
    let parent_only =
        init_scoped(&path, "m", &grant(&["requests"], &["requests"])).unwrap();
    assert!(parent_only
        .get()
        .unwrap()
        .execute("DELETE FROM requests WHERE id='rq1'", [])
        .is_err());
}

#[test]
fn a_column_write_grant_updates_that_column_and_neither_inserts_nor_deletes_a_row() {
    let (_keep, path) = core("grant-column-write");
    let pool =
        init_scoped(&path, "m", &grant(&["requests"], &["requests.title"])).unwrap();
    let conn = pool.get().unwrap();

    conn.execute("UPDATE requests SET title='x' WHERE id='rq1'", []).unwrap();

    assert!(conn.execute("UPDATE requests SET status='denied' WHERE id='rq1'", []).is_err());
    assert!(conn
        .execute(
            "INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES ('rq2','movie',1,'x','approved',1,1)",
            [],
        )
        .is_err());
    assert!(conn.execute("DELETE FROM requests WHERE id='rq1'", []).is_err());
}

#[test]
fn an_empty_grant_answers_nothing() {
    let (_keep, path) = core("grant-empty");
    let pool = init_scoped(&path, "tv.kroma.vpn", &Grant::none()).unwrap();
    let conn = pool.get().unwrap();
    assert!(conn.prepare("SELECT id FROM requests").is_err());
    assert!(conn.prepare("SELECT id FROM users").is_err());
}

#[test]
fn the_schema_is_not_the_core_database() {
    // ATTACH would re-open the same file under a name the per-table rules
    // never see, and DDL would let a module reshape tables it cannot read.
    let (_keep, path) = core("grant-escape");
    let pool = init_scoped(&path, "m", &grant(&["requests"], &["requests"])).unwrap();
    let conn = pool.get().unwrap();

    assert!(conn.execute("ATTACH DATABASE ':memory:' AS side", []).is_err());
    assert!(conn.execute("CREATE TABLE mine (id TEXT)", []).is_err());
    assert!(conn.execute("DROP TABLE requests", []).is_err());
    assert!(conn.execute("ALTER TABLE requests ADD COLUMN sneaky TEXT", []).is_err());
}

#[test]
fn an_aggregate_over_a_granted_table_still_runs() {
    // `count(*)` raises a table-level READ with an empty column plus a
    // FUNCTION action; both have to pass or every module query breaks.
    let (_keep, path) = core("grant-aggregate");
    let pool = init_scoped(&path, "m", &grant(&["requests.id"], &[])).unwrap();
    let conn = pool.get().unwrap();
    let n: i64 = conn.query_row("SELECT count(*) FROM requests", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
}

#[test]
fn two_modules_read_the_same_database_through_different_scopes() {
    let (_keep, path) = core("grant-two");
    let a = init_scoped(&path, "a", &grant(&["requests"], &[])).unwrap();
    let b = init_scoped(&path, "b", &grant(&["users.username"], &[])).unwrap();

    assert!(a.get().unwrap().prepare("SELECT title FROM requests").is_ok());
    assert!(a.get().unwrap().prepare("SELECT username FROM users").is_err());
    assert!(b.get().unwrap().prepare("SELECT username FROM users").is_ok());
    assert!(b.get().unwrap().prepare("SELECT title FROM requests").is_err());
}

#[test]
fn a_grant_round_trips_through_the_manifest_shape() {
    let g: Grant =
        serde_json::from_str(r#"{ "read": ["requests", "users.username"], "write": ["wanted"] }"#)
            .unwrap();
    assert_eq!(g.read, ["requests", "users.username"]);
    assert_eq!(g.write, ["wanted"]);
    assert_eq!(serde_json::from_value::<Grant>(serde_json::to_value(&g).unwrap()).unwrap(), g);
    // An absent object is the empty grant, not an error.
    assert_eq!(serde_json::from_str::<Grant>("{}").unwrap(), Grant::none());
}

#[test]
fn table_and_column_entries_for_one_table_keep_the_wider_grant() {
    let compiled = grant(&["users.username", "users"], &[]).compile();
    assert!(allows(&compiled.read, "users", "email"));
    // Order must not matter.
    let compiled = grant(&["users", "users.username"], &[]).compile();
    assert!(allows(&compiled.read, "users", "email"));
}

#[test]
fn a_table_name_matches_whatever_case_the_sql_used() {
    let compiled = grant(&["Requests.Title"], &[]).compile();
    assert!(allows(&compiled.read, "requests", "title"));
    assert!(allows(&compiled.read, "REQUESTS", "TITLE"));
    assert!(!allows(&compiled.read, "requests", "status"));
}
