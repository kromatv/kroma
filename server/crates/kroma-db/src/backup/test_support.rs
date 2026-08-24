use std::collections::BTreeMap;

use rusqlite::Connection;

use super::{BackupDoc, VERSION};
use crate::testing::TempPool;
use crate::Pool;

pub(super) fn fresh_pool(tag: &str) -> TempPool {
    crate::testing::temp_pool(&format!("bkp-{tag}"))
}

// The data directory the pool's database sits in, which is also where a
// module's own store lives.
pub(super) fn data_dir(pool: &Pool) -> std::path::PathBuf {
    pool.path()
        .parent()
        .expect("the database has a directory")
        .to_path_buf()
}

// Stand up one module's own database the way a running module would: the
// indexer's table, holding an API key nobody wants to lose in a restore.
pub(super) fn seed_indexer_store(dir: &std::path::Path, rows: &str) -> std::path::PathBuf {
    let store = dir
        .join("modules")
        .join("tv.kroma.indexer")
        .join("module.sqlite");
    std::fs::create_dir_all(store.parent().unwrap()).unwrap();
    let conn = Connection::open(&store).unwrap();
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS indexers (id TEXT PRIMARY KEY, name TEXT NOT NULL, \
         api_key TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);{rows}"
    ))
    .unwrap();
    store
}

pub(super) fn store_count(store: &std::path::Path, table: &str) -> i64 {
    Connection::open(store)
        .unwrap()
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

pub(super) fn count(pool: &Pool, table: &str) -> i64 {
    pool.get()
        .unwrap()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

pub(super) fn empty_doc() -> BackupDoc {
    BackupDoc {
        version: VERSION,
        exported_at: "t".into(),
        tables: BTreeMap::new(),
        assets: BTreeMap::new(),
        modules: BTreeMap::new(),
    }
}
