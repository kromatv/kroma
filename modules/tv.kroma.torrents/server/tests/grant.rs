//! What this module's `storage.core` grant has to cover, checked against the
//! grant it actually ships.
//!
//! The downloads ledger is a SHARED table -- the core reads it for the progress
//! overlay on request and discover lists, and `request_id` is a real foreign key
//! into `requests` -- so it stays in the core database and this module holds a
//! grant on it. The client configs, credentials and all, went the other way: into
//! this module's own file, which no grant governs.

use kroma_module_sdk::db::{self, testing::TempPool, Pool};

fn scoped() -> (TempPool, Pool) {
    let core = db::testing::temp_pool("torrents-grant");
    let grant = db::testing::grant_from_manifest(include_str!("../../module.json"));
    let scoped = core.scoped("tv.kroma.torrents", &grant);
    (core, scoped)
}

fn row(id: &str, request_id: Option<&str>) -> kroma_torrent::db::DownloadRow {
    kroma_torrent::db::DownloadRow {
        id: id.into(),
        client_id: "embedded".into(),
        client_ref: String::new(),
        request_id: request_id.map(str::to_string),
        kind: "movie".into(),
        tmdb_id: 603,
        title: Some("The Matrix".into()),
        year: Some(1999),
        season: None,
        episodes: None,
        release_title: "The.Matrix.1999.1080p".into(),
        indexer_id: None,
        info_hash: None,
        magnet_or_url: "magnet:?xt=urn:btih:deadbeef".into(),
        size_bytes: None,
        score: None,
        score_breakdown: None,
        status: "queued".into(),
        progress: 0.0,
        save_path: None,
        imported_paths: None,
        error: None,
        grabbed_at: 1,
        completed_at: None,
        imported_at: None,
        details_url: None,
        only_files: None,
        upgrade: false,
    }
}

#[test]
fn the_grant_covers_the_ledger_this_module_owns_in_the_core_database() {
    let (core, scoped) = scoped();
    core.get()
        .unwrap()
        .execute_batch(
            "INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES ('rq1','movie',603,'The Matrix','approved',1,1);
             INSERT INTO wanted (id,request_id,kind,tmdb_id,title,status,updated_at) \
             VALUES ('wt1','rq1','movie',603,'The Matrix','wanted',1);",
        )
        .unwrap();

    // A grab writes `downloads` and flips the wanted row it satisfies. The
    // foreign key into `requests` is why `requests` is in the READ list: the
    // constraint check is a real read of the parent.
    kroma_torrent::db::insert_download(&scoped, &row("d1", Some("rq1"))).unwrap();
    kroma_torrent::db::set_wanted_status(&scoped, &["wt1".to_string()], "grabbed", 2).unwrap();

    let conn = scoped.get().unwrap();
    assert_eq!(kroma_torrent::db::active_downloads(&conn).unwrap().len(), 1);
    assert!(kroma_torrent::db::get_download(&conn, "d1")
        .unwrap()
        .is_some());
    assert!(kroma_torrent::db::get_request(&conn, "rq1")
        .unwrap()
        .is_some());
    drop(conn);

    kroma_torrent::db::update_download_progress(&scoped, "d1", "downloading", 0.5, None, None)
        .unwrap();
    kroma_torrent::db::mark_download_completed(&scoped, "d1", 3).unwrap();
    kroma_torrent::db::delete_download_row(&scoped, "d1").unwrap();
}

#[test]
fn the_grant_reaches_neither_accounts_nor_the_client_credentials_that_moved_out() {
    let (_core, scoped) = scoped();
    let conn = scoped.get().unwrap();

    for sql in [
        "SELECT token FROM sessions",
        "SELECT password_hash FROM users",
        "SELECT value FROM settings",
        "SELECT api_key FROM indexers",
    ] {
        assert!(
            conn.prepare(sql).is_err(),
            "the grant must not reach: {sql}"
        );
    }

    // `download_clients` is this module's own table now, in its own file: it is
    // not in the core database at all, so there is nothing here to reach.
    assert!(conn
        .prepare("SELECT password FROM download_clients")
        .is_err());
}

#[test]
fn this_modules_migrations_build_its_own_table_and_leave_the_shared_one_alone() {
    // `migrations()` runs against the module's OWN database now. A shared table
    // listed here would be created a second time, empty, in a file where its
    // foreign key has no parent -- and the module would still read the real one.
    let dir = kroma_testing::temp_dir("torrents-store");
    let store = db::open(&dir.path().join("module.sqlite")).unwrap();
    let conn = store.get().unwrap();
    db::apply_migrations(&conn, kroma_torrent::db::MIGRATIONS).unwrap();

    let table = |name: &str| -> i64 {
        conn.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = ?1",
            [name],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_eq!(
        table("download_clients"),
        1,
        "the credentials table is this module's own"
    );
    assert_eq!(
        table("downloads"),
        0,
        "the shared ledger belongs to the core schema"
    );
}

#[test]
fn the_client_configs_are_read_from_this_modules_own_database() {
    // Four call sites read `download_clients` off the CORE pool after the table
    // moved into this module's file, and each one failed the same way in
    // production: "no such table: download_clients". The table is not in the
    // core schema at all, so anything still looking there cannot work -- which
    // is what this asserts, from the manager down.
    let core = db::testing::temp_pool("torrents-clients");
    let store = core.store();
    {
        let conn = store.get().unwrap();
        db::apply_migrations(&conn, kroma_torrent::db::MIGRATIONS).unwrap();
    }
    let dir = kroma_testing::temp_dir("torrents-clients-dir");
    // No engine is resolved in this test: the host answers nothing, which is a
    // server with no download-engine module installed.
    let host: std::sync::Arc<dyn kroma_module_sdk::host::HostCtx> =
        std::sync::Arc::new(kroma_module_sdk::host::testing::StubHost::new());
    let manager =
        kroma_torrent::DownloadManager::new(host, dir.path(), (*core).clone(), store.clone());

    // Seeding the embedded engine writes the module's own file. Without the
    // `rqbit` feature there is no embedded engine to seed, so the seed is a
    // no-op by design and the row below is the one this test puts there.
    manager.seed_embedded_client();
    if !kroma_torrent::RQBIT_COMPILED {
        let conn = store.get().unwrap();
        conn.execute(
            "INSERT INTO download_clients (id,kind,name,password,enabled,priority,created_at) \
             VALUES ('qb','qbittorrent','qBit','hunter2',1,0,1)",
            [],
        )
        .unwrap();
    }
    let seeded = kroma_torrent::db::list_download_clients(&store.get().unwrap()).unwrap();
    assert_eq!(
        seeded.len(),
        1,
        "the client config is in this module's database"
    );

    // ...and the shared database has no such table to have written it into.
    let absent: i64 = core
        .get()
        .unwrap()
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='download_clients'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        absent, 0,
        "the credentials table is not in the shared database"
    );
}
