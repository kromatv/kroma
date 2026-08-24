//! What this module's `storage.core` grant has to cover, checked against the
//! grant it actually ships.
//!
//! An under-declared grant does not fail to compile: it fails at runtime, three
//! layers down someone's search pass, as `SQLITE_AUTH`. This module has no tables
//! of its own -- it orchestrates the core's request / wanted ledger -- so its
//! grant is the widest of any module and the easiest to get wrong. Every core
//! query it makes is prepared here against a pool scoped by its own
//! `module.json`, so adding a call site that reaches further fails HERE.

use kroma_module_sdk::db::{self, testing::TempPool, Pool};

// The core database plus the pool this module's process is actually handed:
// same file, scoped to the grant its own `module.json` ships.
fn scoped() -> (TempPool, Pool) {
    let core = db::testing::temp_pool("acq-grant");
    let grant = db::testing::grant_from_manifest(include_str!("../../module.json"));
    let scoped = core.scoped("tv.kroma.acquisition", &grant);
    (core, scoped)
}

fn seed(pool: &Pool) {
    let conn = pool.get().unwrap();
    conn.execute_batch(
        "INSERT INTO users (id,email,username,password_hash,created_at,permissions) \
         VALUES ('u1','a@b.c','ana','h','now','[\"playback\"]');
         INSERT INTO requests (id,kind,tmdb_id,title,status,requested_by,created_at,updated_at) \
         VALUES ('rq1','movie',603,'The Matrix','approved','u1',1,1);
         INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
         VALUES ('wt1','rq1','movie',603,'The Matrix','wanted',1);
         INSERT INTO libraries (id,name,kind,path,added_at) \
         VALUES ('lib1','Films','movies','/media/films','now');
         INSERT INTO items (id,kind,title,container,library,added_at) \
         VALUES ('it1','movie','The Matrix','mkv','lib1','now');
         INSERT INTO files (id,item_id,abs_path,container) \
         VALUES ('f1','it1','/media/films/The Matrix.mkv','mkv');
         INSERT INTO shows (id,library,title,added_at) VALUES ('sh1','lib1','A Show','now');",
    )
    .unwrap();
}

#[test]
fn the_grant_covers_every_core_query_this_module_makes() {
    let (core, scoped) = scoped();
    seed(&core);
    let conn = scoped.get().unwrap();

    // The request / wanted ledger: read (auto.rs, search/, import.rs).
    assert!(db::get_request(&conn, "rq1").unwrap().is_some());
    db::wanted_searchable(&conn, "2024-01-01", 1, 50).unwrap();
    assert_eq!(db::wanted_for_request(&conn, "rq1").unwrap().len(), 1);

    // The catalog, for availability matching and replace-on-upgrade.
    db::show_by_tmdb(&conn, 603).unwrap();
    db::movie_files_by_tmdb(&conn, 603, Some("lib1")).unwrap();
    db::episode_files(&conn, "sh1", 1, 1, Some("lib1")).unwrap();
    drop(conn);

    // ...and the two writes: the search backoff and the import's TMDB hint.
    db::schedule_next_search(&scoped, &["wt1".to_string()], 1, 60_000).unwrap();
    db::set_file_tmdb(&scoped, "/media/films/The Matrix.mkv", 603).unwrap();
}

#[test]
fn the_grant_stops_at_the_tables_this_module_has_no_business_in() {
    // The point of declaring one. A sidecar used to be handed the whole database
    // ambiently, session token hashes included.
    let (core, scoped) = scoped();
    seed(&core);
    let conn = scoped.get().unwrap();

    for sql in [
        "SELECT token FROM sessions",
        "SELECT password_hash FROM users",
        "SELECT credential_id FROM passkeys",
        "SELECT endpoint FROM push_subscriptions",
        "SELECT position_ms FROM progress",
        "SELECT value FROM settings",
    ] {
        assert!(
            conn.prepare(sql).is_err(),
            "the grant must not reach: {sql}"
        );
    }

    // Reading a request is not editing an account.
    assert!(conn
        .execute("UPDATE users SET username = 'x' WHERE id = 'u1'", [])
        .is_err());
    assert!(conn
        .execute("DELETE FROM users WHERE id = 'u1'", [])
        .is_err());
}
