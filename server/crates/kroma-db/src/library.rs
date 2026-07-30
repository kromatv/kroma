//! Library reads: the scanned library roots and their item counts.

use super::*;

use kroma_domain::{Library, LibraryKind};

pub fn list_libraries(pool: &Pool) -> Result<Vec<Library>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,name,kind,path,(SELECT COUNT(*) FROM items i WHERE i.library=l.id) \
         FROM libraries l ORDER BY name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Library {
            id: r.get(0)?,
            name: r.get(1)?,
            kind: parse_library_kind(&r.get::<_, String>(2)?),
            path: r.get(3)?,
            item_count: r.get::<_, i64>(4)? as usize,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn parse_library_kind(s: &str) -> LibraryKind {
    match s {
        "shows" => LibraryKind::Shows,
        "mixed" => LibraryKind::Mixed,
        _ => LibraryKind::Movies,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn pool() -> Pool {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-lib-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::init(&path).unwrap()
    }

    #[test]
    fn list_libraries_counts_items_and_parses_kind() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('l2','Series','shows','/tv','t')", []).unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('l1','Films','movies','/mov','t')", []).unwrap();
            for id in ["m1", "m2"] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,added_at) VALUES (?1,'movie','T','mkv','l1','t')",
                    params![id],
                )
                .unwrap();
            }
        }
        let libs = list_libraries(&p).unwrap();
        assert_eq!(libs.len(), 2);
        assert_eq!(libs[0].id, "l1");
        assert_eq!(libs[0].kind, LibraryKind::Movies);
        assert_eq!(libs[0].item_count, 2);
        assert_eq!(libs[1].id, "l2");
        assert_eq!(libs[1].kind, LibraryKind::Shows);
        assert_eq!(libs[1].item_count, 0);
    }
}
