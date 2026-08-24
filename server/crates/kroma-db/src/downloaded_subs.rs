//! Subtitles fetched from an online provider and cached as WebVTT. One row per
//! downloaded track; merged into the item's subtitle list so they show in the
//! player next to embedded tracks.

use rusqlite::OptionalExtension;

use super::*;

/// A cached generated subtitle; `path` is an absolute WebVTT file under the data dir.
#[derive(Debug, Clone)]
pub struct DownloadedSub {
    pub id: String,
    pub item_id: String,
    pub language: Option<String>,
    pub label: String,
    pub provider: String,
    pub path: String,
}

fn from_row(r: &Row) -> rusqlite::Result<DownloadedSub> {
    Ok(DownloadedSub {
        id: r.get(0)?,
        item_id: r.get(1)?,
        language: r.get(2)?,
        label: r.get(3)?,
        provider: r.get(4)?,
        path: r.get(5)?,
    })
}

const COLS: &str = "id, item_id, language, label, provider, path";

/// Oldest first.
pub fn downloaded_subs_for_item(
    conn: &Connection,
    item_id: &str,
) -> rusqlite::Result<Vec<DownloadedSub>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM downloaded_subtitles WHERE item_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![item_id], from_row)?;
    rows.collect()
}

pub fn downloaded_sub(conn: &Connection, id: &str) -> rusqlite::Result<Option<DownloadedSub>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM downloaded_subtitles WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map(params![id], from_row)?;
    rows.next().transpose()
}

pub fn insert_downloaded_sub(pool: &Pool, sub: &DownloadedSub) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR REPLACE INTO downloaded_subtitles (id, item_id, language, label, provider, path, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![sub.id, sub.item_id, sub.language, sub.label, sub.provider, sub.path],
    )?;
    Ok(())
}

/// Returns the deleted row's file path so the caller can remove the cached
/// WebVTT from disk.
pub fn delete_downloaded_sub(pool: &Pool, id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let path: Option<String> = conn
        .query_row(
            "SELECT path FROM downloaded_subtitles WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?;
    if path.is_some() {
        conn.execute(
            "DELETE FROM downloaded_subtitles WHERE id = ?1",
            params![id],
        )?;
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool_with_item() -> TempPool {
        let pool = crate::testing::temp_pool("dsub");
        let conn = pool.get().unwrap();
        conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','T','mkv','lib','t')",
            [],
        )
        .unwrap();
        drop(conn);
        pool
    }

    fn sub(id: &str) -> DownloadedSub {
        DownloadedSub {
            id: id.into(),
            item_id: "m1".into(),
            language: Some("fr".into()),
            label: "Francais (Whisper)".into(),
            provider: "whisper".into(),
            path: format!("/data/subs/{id}.vtt"),
        }
    }

    #[test]
    fn insert_list_get_and_delete() {
        let p = pool_with_item();
        insert_downloaded_sub(&p, &sub("s1")).unwrap();
        insert_downloaded_sub(&p, &sub("s2")).unwrap();

        let conn = p.get().unwrap();
        let subs = downloaded_subs_for_item(&conn, "m1").unwrap();
        assert_eq!(subs.len(), 2);
        assert_eq!(subs[0].language.as_deref(), Some("fr"));
        assert_eq!(subs[0].provider, "whisper");
        let one = downloaded_sub(&conn, "s1").unwrap().unwrap();
        assert_eq!(one.path, "/data/subs/s1.vtt");
        assert!(downloaded_sub(&conn, "missing").unwrap().is_none());
        drop(conn);

        assert_eq!(
            delete_downloaded_sub(&p, "s1").unwrap().as_deref(),
            Some("/data/subs/s1.vtt")
        );
        assert!(delete_downloaded_sub(&p, "s1").unwrap().is_none());
        let conn = p.get().unwrap();
        assert_eq!(downloaded_subs_for_item(&conn, "m1").unwrap().len(), 1);
    }
}
