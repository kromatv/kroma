use crate::{admin, db, search, Query};

mod builtin;
mod engine;
mod paced;

fn port_row() -> db::IndexerRow {
    db::IndexerRow {
        id: "a".into(),
        name: "N".into(),
        url: "http://x".into(),
        api_key: String::new(),
        categories: vec![2000],
        enabled: true,
        priority: 0,
        kind: admin::KIND_BUILTIN.into(),
        definition_id: Some("def".into()),
        settings: "{}".into(),
        last_ok_at: None,
        last_error: None,
        created_at: 0,
    }
}

#[test]
fn resolve_download_short_circuits_on_magnet_without_touching_host() {
    use crate::port::DownloadTarget;
    let magnet = "magnet:?xt=urn:btih:deadbeef";
    let out = search::resolve_download(&DbHost::new(), &port_row(), "Some Title", None, magnet)
        .expect("magnet resolves without a session");
    assert!(
        matches!(out, DownloadTarget::Magnet(ref m) if m == magnet),
        "{out:?}"
    );
}

fn db_pool() -> kroma_module_sdk::db::testing::TempPool {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-lib");
    {
        let conn = pool.get().unwrap();
        kroma_module_sdk::db::apply_migrations(&conn, db::MIGRATIONS).expect("indexers schema");
    }
    pool
}

type DbHost = kroma_module_sdk::host::testing::StubHost;

fn seed_row(id: &str, kind: &str, enabled: bool, created_at: i64) -> db::IndexerRow {
    let mut r = port_row();
    r.id = id.into();
    r.kind = kind.into();
    r.enabled = enabled;
    r.created_at = created_at;
    r
}

#[test]
fn indexer_db_port_lists_gets_and_notes_against_a_real_db() {
    let pool = db_pool();
    db::insert_indexer(&pool, &seed_row("a", admin::KIND_BUILTIN, true, 100)).unwrap();
    db::insert_indexer(&pool, &seed_row("b", "torznab", false, 200)).unwrap();
    let conn = pool.get().unwrap();

    assert_eq!(db::list_indexers(&conn).unwrap().len(), 2);
    assert_eq!(db::get_indexer(&conn, "a").unwrap().unwrap().id, "a");
    assert!(db::get_indexer(&conn, "ghost").unwrap().is_none());
    let enabled = db::enabled_indexers(&conn).unwrap();
    assert_eq!(enabled.len(), 1);
    assert_eq!(enabled[0].id, "a");
    drop(conn);
    db::note_indexer_result(&pool, "a", true, None, 4242).unwrap();
    let conn = pool.get().unwrap();
    assert_eq!(
        db::get_indexer(&conn, "a").unwrap().unwrap().last_ok_at,
        Some(4242)
    );
}

#[test]
fn torrent_fetch_returns_none_for_unknown_or_non_builtin_indexer() {
    let pool = db_pool();
    db::insert_indexer(&pool, &seed_row("tz", "torznab", true, 100)).unwrap();
    let host = DbHost::with_store(pool.clone());

    assert_eq!(
        search::fetch_torrent(&host, "nope", "http://x/f.torrent").unwrap(),
        None
    );
    assert_eq!(
        search::fetch_torrent(&host, "tz", "http://x/f.torrent").unwrap(),
        None
    );
}

fn port_query() -> Query {
    Query::Movie {
        tmdb_id: Some(603),
        imdb_id: None,
        title: "The Matrix".into(),
        year: Some(1999),
    }
}
