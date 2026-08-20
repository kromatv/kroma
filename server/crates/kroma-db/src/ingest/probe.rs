//! What ffprobe found, and the representative columns it recomputes.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// (file_id, abs_path, owning item_id) for every file awaiting an ffprobe pass.
pub fn unprobed_files(pool: &Pool) -> Result<Vec<(String, String, String)>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT id, abs_path, item_id FROM files WHERE probed = 0")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Item ids that are fully probed (≥1 file, none unprobed).
pub fn probed_item_ids(pool: &Pool) -> Result<std::collections::HashSet<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT item_id FROM files GROUP BY item_id \
         HAVING SUM(CASE WHEN probed=0 THEN 1 ELSE 0 END)=0",
    )?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Whether every file of an item is probed (and it has at least one).
pub fn item_probed(pool: &Pool, item_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let (total, unprobed): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), SUM(CASE WHEN probed=0 THEN 1 ELSE 0 END) FROM files WHERE item_id=?1",
        params![item_id],
        |r| Ok((r.get(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0))),
    )?;
    Ok(total > 0 && unprobed == 0)
}

pub fn file_ids_for_item(pool: &Pool, item_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id FROM files WHERE item_id=?1")?;
    let rows = stmt.query_map(params![item_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn unprobe_item_files(pool: &Pool, item_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("UPDATE files SET probed=0 WHERE item_id=?1", params![item_id])?;
    Ok(())
}

/// Every file's `(id, "mtime:size")`: a changed file gets a new signature and is
/// re-probed.
pub fn all_file_sigs(pool: &Pool) -> Result<Vec<(String, String)>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT id, COALESCE(mtime,0) || ':' || COALESCE(size,0) FROM files")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// `(abs_path, item_id, probed)` for one file; `None` if the file row is gone.
pub fn probe_target(pool: &Pool, file_id: &str) -> Result<Option<(String, String, bool)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT abs_path, item_id, probed FROM files WHERE id=?1")?;
    let mut rows = stmt.query_map(params![file_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)? != 0))
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn item_has_probed_file(pool: &Pool, item_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM files WHERE item_id = ?1 AND probed = 1",
        params![item_id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::test_support::*;
    use std::collections::HashMap;

    #[test]
    fn probe_helpers_over_seeded_files() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            for id in ["m1", "m2"] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,added_at) VALUES (?1,'movie','T','mkv','lib','t')",
                    params![id],
                )
                .unwrap();
            }
            // m1: one probed + one unprobed (not fully probed).
            conn.execute(
                "INSERT INTO files (id,item_id,abs_path,container,probed,mtime,size) VALUES ('f1','m1','/a',' ',1,100,2000)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id,item_id,abs_path,container,probed) VALUES ('f2','m1','/b','',0)",
                [],
            )
            .unwrap();
            // m2: a single probed file (fully probed).
            conn.execute(
                "INSERT INTO files (id,item_id,abs_path,container,probed) VALUES ('f3','m2','/c','',1)",
                [],
            )
            .unwrap();
        }

        assert!(!item_probed(&p, "m1").unwrap());
        assert!(item_probed(&p, "m2").unwrap());
        assert!(!item_probed(&p, "missing").unwrap());

        let fully = probed_item_ids(&p).unwrap();
        assert!(fully.contains("m2") && !fully.contains("m1"));

        let mut ids = file_ids_for_item(&p, "m1").unwrap();
        ids.sort();
        assert_eq!(ids, vec!["f1".to_string(), "f2".to_string()]);

        assert_eq!(probe_target(&p, "f1").unwrap(), Some(("/a".to_string(), "m1".to_string(), true)));
        assert!(probe_target(&p, "gone").unwrap().is_none());
        let sigs: HashMap<String, String> = all_file_sigs(&p).unwrap().into_iter().collect();
        assert_eq!(sigs.get("f1").map(String::as_str), Some("100:2000"));
        assert_eq!(sigs.get("f3").map(String::as_str), Some("0:0")); // null mtime/size

        unprobe_item_files(&p, "m1").unwrap();
        assert!(!item_has_probed_file(&p, "m1").unwrap());
    }

    #[test]
    fn the_probe_state_readers_error_when_the_file_table_is_gone() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE files").unwrap();

        assert!(item_probed(&p, "m1").is_err());
        assert!(item_has_probed_file(&p, "m1").is_err());
    }
}
