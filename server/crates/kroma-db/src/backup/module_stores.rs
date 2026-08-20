//! A module's own database, dumped whole and put back where it came from.

use std::collections::BTreeMap;

use anyhow::{Context, Result};
use rusqlite::Connection;
use serde_json::{Map, Value};

use super::rows::{dump_query, is_ident, restore_rows};
use super::{table_exists, BackupDoc};

/// Every installed module's own database, as `(module id, path)`. Empty when
/// nothing is installed, which is the zero-module base build.
pub(super) fn module_stores(data_dir: &std::path::Path) -> Vec<(String, std::path::PathBuf)> {
    let Ok(entries) = std::fs::read_dir(data_dir.join("modules")) else {
        return Vec::new();
    };
    let mut out: Vec<(String, std::path::PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let store = e.path().join("module.sqlite");
            let id = e.file_name().to_string_lossy().into_owned();
            store.is_file().then_some((id, store))
        })
        .collect();
    out.sort();
    out
}

// Every user table in one module's database, whatever they are: the core does
// not know a module's schema and has no business learning it.
pub(super) fn dump_store(path: &std::path::Path) -> Result<BTreeMap<String, Vec<Map<String, Value>>>> {
    let conn = Connection::open(path)?;
    let names: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")?
        .query_map([], |r| r.get(0))?
        .collect::<std::result::Result<_, _>>()?;
    let mut out = BTreeMap::new();
    for name in names {
        out.insert(name.clone(), dump_query(&conn, &format!("SELECT * FROM \"{name}\""))?);
    }
    Ok(out)
}

// A module's rows go back into that module's own database, and only into tables
// it has already created. A module absent from this server (or one that has
// never started, so its schema does not exist yet) is skipped: its rows stay in
// the document and land the next time the same backup is restored somewhere the
// module IS installed.
pub(super) fn restore_modules(
    data_dir: &std::path::Path,
    doc: &BackupDoc,
    reset: bool,
) -> Vec<(String, usize)> {
    let mut summary = Vec::new();
    for (id, tables) in &doc.modules {
        // The document is an uploaded file, so its module ids are untrusted and
        // land in a path: anything but a reverse-DNS id could walk out of the
        // data directory.
        if !is_module_id(id) {
            tracing::warn!(module = %id, "not a module id; its rows are not restored");
            continue;
        }
        let path = data_dir.join("modules").join(id).join("module.sqlite");
        if !path.is_file() {
            tracing::info!(module = %id, "not installed here; its rows are not restored");
            continue;
        }
        match restore_store(&path, tables, reset) {
            Ok(counts) => summary.extend(counts.into_iter().map(|(t, n)| (format!("{id}/{t}"), n))),
            Err(error) => tracing::warn!(module = %id, %error, "module rows not restored"),
        }
    }
    summary
}

fn restore_store(
    path: &std::path::Path,
    tables: &BTreeMap<String, Vec<Map<String, Value>>>,
    reset: bool,
) -> Result<Vec<(String, usize)>> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let mut summary = Vec::new();
    for (name, rows) in tables {
        if !is_ident(name) || !table_exists(&tx, name)? {
            continue;
        }
        if reset {
            tx.execute(&format!("DELETE FROM \"{name}\""), [])?;
        }
        let n = restore_rows(&tx, name, rows).with_context(|| format!("restoring {name}"))?;
        summary.push((name.clone(), n));
    }
    tx.commit()?;
    Ok(summary)
}

// A reverse-DNS module id (`tv.kroma.torrents`), which is also the name of its
// directory: no separator, no `..`, nothing a path could follow out of the data
// directory.
fn is_module_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && !s.starts_with('.')
        && s.split('.').all(|label| {
            !label.is_empty()
                && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::{export_portable, import_portable};
    use crate::backup::test_support::*;

    #[test]
    fn a_modules_own_database_travels_with_the_backup() {
        // The indexer API keys and download-client passwords moved out of the
        // core database, and losing them in a restore would be the whole point
        // of a backup gone.
        let src = fresh_pool("mod-src");
        let src_dir = data_dir(&src);
        seed_indexer_store(
            &src_dir,
            "INSERT INTO indexers VALUES ('ix1','Jackett','secret',1);",
        );

        let doc = export_portable(&src, &src_dir).unwrap();
        let dumped = &doc.modules["tv.kroma.indexer"]["indexers"];
        assert_eq!(dumped.len(), 1);
        assert_eq!(dumped[0]["api_key"], Value::from("secret"));

        // The target has the module installed and started, so its schema exists.
        let dst = fresh_pool("mod-dst");
        let dst_dir = data_dir(&dst);
        let dst_store = seed_indexer_store(&dst_dir, "");

        let summary = import_portable(&dst, &dst_dir, &doc, false).unwrap();
        assert!(summary.contains(&("tv.kroma.indexer/indexers".to_string(), 1)), "{summary:?}");
        assert_eq!(store_count(&dst_store, "indexers"), 1);
        let key: String = Connection::open(&dst_store)
            .unwrap()
            .query_row("SELECT api_key FROM indexers WHERE id='ix1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(key, "secret");
    }

    #[test]
    fn rows_for_a_module_this_server_does_not_have_are_left_in_the_document() {
        // Restoring onto a server where the module is not installed must not
        // fail the restore, and must not invent a database for it either.
        let dst = fresh_pool("mod-absent");
        let dir = data_dir(&dst);
        let mut doc = empty_doc();
        doc.modules.insert(
            "tv.kroma.indexer".into(),
            BTreeMap::from([(
                "indexers".to_string(),
                vec![Map::from_iter([("id".to_string(), Value::from("ix1"))])],
            )]),
        );

        assert!(import_portable(&dst, &dir, &doc, false).unwrap().is_empty());
        assert!(!dir.join("modules/tv.kroma.indexer/module.sqlite").exists());
    }

    #[test]
    fn a_module_id_that_is_a_path_never_becomes_one() {
        let dst = fresh_pool("mod-traversal");
        let dir = data_dir(&dst);
        let outside = dir.join("outside");
        let store = seed_indexer_store(&outside, "");
        let mut doc = empty_doc();
        doc.modules.insert(
            "../outside/modules/tv.kroma.indexer".into(),
            BTreeMap::from([(
                "indexers".to_string(),
                vec![Map::from_iter([
                    ("id".to_string(), Value::from("ix1")),
                    ("name".to_string(), Value::from("J")),
                    ("api_key".to_string(), Value::from("k")),
                    ("created_at".to_string(), Value::from(1)),
                ])],
            )]),
        );

        assert!(import_portable(&dst, &dir, &doc, false).unwrap().is_empty());
        assert_eq!(store_count(&store, "indexers"), 0);
    }
}
