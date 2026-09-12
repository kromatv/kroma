use std::collections::{BTreeMap, BTreeSet};

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

pub(super) fn schema_tables(pool: &Pool) -> BTreeSet<String> {
    let conn = pool.get().unwrap();
    let names: BTreeSet<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    names
}

pub(super) fn seed_a_row_in(pool: &Pool, table: &str) {
    let conn = pool.get().unwrap();
    let columns: Vec<(String, String)> = conn
        .prepare("SELECT name, type FROM pragma_table_info(?1)")
        .unwrap()
        .query_map([table], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let names: Vec<String> = columns
        .iter()
        .map(|(name, _)| format!("\"{name}\""))
        .collect();
    let values: Vec<&str> = columns
        .iter()
        .map(|(_, declared)| sample_of(declared))
        .collect();
    conn.execute_batch(&format!(
        "PRAGMA foreign_keys = OFF; \
         INSERT INTO \"{table}\" ({}) VALUES ({}); \
         PRAGMA foreign_keys = ON;",
        names.join(","),
        values.join(",")
    ))
    .unwrap();
}

fn sample_of(declared: &str) -> &'static str {
    let declared = declared.to_ascii_uppercase();
    if declared.contains("INT") {
        "1"
    } else if declared.contains("REAL") {
        "1.5"
    } else if declared.contains("BLOB") {
        "x'00'"
    } else {
        "'x'"
    }
}
