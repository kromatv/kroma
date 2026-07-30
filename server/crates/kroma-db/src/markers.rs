//! Episode segment markers: one row per `(item_id, kind)`, bounds in ms.

use super::*;
use kroma_domain::{Marker, MarkerKind};

fn kind_str(kind: MarkerKind) -> &'static str {
    match kind {
        MarkerKind::Intro => "intro",
        MarkerKind::Credits => "credits",
    }
}

fn kind_from_str(s: &str) -> Option<MarkerKind> {
    match s {
        "intro" => Some(MarkerKind::Intro),
        "credits" => Some(MarkerKind::Credits),
        _ => None,
    }
}

pub fn item_ids_with_markers(pool: &Pool) -> Result<std::collections::HashSet<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT DISTINCT item_id FROM markers")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// An intro-less episode also has none: combine with the ledger.
pub fn has_markers(pool: &Pool, item_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n: i64 =
        conn.query_row("SELECT COUNT(*) FROM markers WHERE item_id=?1", params![item_id], |r| {
            r.get(0)
        })?;
    Ok(n > 0)
}

/// Unknown kinds are skipped, so a future kind cannot break older clients.
pub fn markers_for_item(conn: &Connection, item_id: &str) -> rusqlite::Result<Vec<Marker>> {
    let mut stmt = conn
        .prepare("SELECT kind, start_ms, end_ms FROM markers WHERE item_id = ?1 ORDER BY start_ms")?;
    let rows = stmt.query_map(params![item_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, i64>(2)?,
        ))
    })?;
    let mut out = Vec::new();
    for r in rows {
        let (kind, start, end) = r?;
        if let Some(kind) = kind_from_str(&kind) {
            out.push(Marker { kind, start_ms: start.max(0) as u64, end_ms: end.max(0) as u64 });
        }
    }
    Ok(out)
}

/// [`markers_for_item`] over many items; ids absent from the result have none.
pub(crate) fn markers_for_items(
    conn: &Connection,
    item_ids: &[&str],
) -> rusqlite::Result<std::collections::HashMap<String, Vec<Marker>>> {
    let mut out: std::collections::HashMap<String, Vec<Marker>> = std::collections::HashMap::new();
    for chunk in item_ids.chunks(super::IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT item_id, kind, start_ms, end_ms FROM markers \
             WHERE item_id IN ({ph}) ORDER BY start_ms",
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })?;
        for row in rows {
            let (item_id, kind, start, end) = row?;
            if let Some(kind) = kind_from_str(&kind) {
                out.entry(item_id).or_default().push(Marker {
                    kind,
                    start_ms: start.max(0) as u64,
                    end_ms: end.max(0) as u64,
                });
            }
        }
    }
    Ok(out)
}

/// Overwrites only when `source` ranks at least as high as the stored one
/// (`manual` > `fingerprint` > `chapters`).
pub fn set_marker(
    pool: &Pool,
    item_id: &str,
    kind: MarkerKind,
    start_ms: u64,
    end_ms: u64,
    source: &str,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO markers (item_id, kind, start_ms, end_ms, source, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now')) \
         ON CONFLICT(item_id, kind) DO UPDATE SET \
           start_ms = excluded.start_ms, end_ms = excluded.end_ms, \
           source = excluded.source, updated_at = excluded.updated_at \
         WHERE (CASE excluded.source WHEN 'manual' THEN 3 WHEN 'fingerprint' THEN 2 WHEN 'chapters' THEN 1 ELSE 0 END) \
            >= (CASE markers.source WHEN 'manual' THEN 3 WHEN 'fingerprint' THEN 2 WHEN 'chapters' THEN 1 ELSE 0 END)",
        params![item_id, kind_str(kind), start_ms as i64, end_ms as i64, source],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn pool_with_item() -> Pool {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-mark-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let pool = crate::init(&path).unwrap();
        let conn = pool.get().unwrap();
        conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')", []).unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('e1','episode','Ep','mkv','lib','t')",
            [],
        )
        .unwrap();
        drop(conn);
        pool
    }

    #[test]
    fn set_read_and_order_markers() {
        let p = pool_with_item();
        assert!(!has_markers(&p, "e1").unwrap());
        assert!(item_ids_with_markers(&p).unwrap().is_empty());

        set_marker(&p, "e1", MarkerKind::Credits, 60_000, 65_000, "chapters").unwrap();
        set_marker(&p, "e1", MarkerKind::Intro, 0, 5_000, "chapters").unwrap();

        assert!(has_markers(&p, "e1").unwrap());
        assert!(item_ids_with_markers(&p).unwrap().contains("e1"));

        let conn = p.get().unwrap();
        let markers = markers_for_item(&conn, "e1").unwrap();
        assert_eq!(markers.len(), 2);
        assert_eq!(markers[0].kind, MarkerKind::Intro);
        assert_eq!(markers[0].start_ms, 0);
        assert_eq!(markers[0].end_ms, 5_000);
        assert_eq!(markers[1].kind, MarkerKind::Credits);

        let batch = markers_for_items(&conn, &["e1", "ghost"]).unwrap();
        assert_eq!(batch["e1"].len(), 2);
        assert!(!batch.contains_key("ghost"));
    }

    #[test]
    fn provenance_precedence() {
        let p = pool_with_item();
        set_marker(&p, "e1", MarkerKind::Intro, 0, 5_000, "fingerprint").unwrap();
        // Lower-ranked source: must not clobber the fingerprint marker.
        set_marker(&p, "e1", MarkerKind::Intro, 999, 1_000, "chapters").unwrap();
        let conn = p.get().unwrap();
        assert_eq!(markers_for_item(&conn, "e1").unwrap()[0].end_ms, 5_000);
        drop(conn);

        set_marker(&p, "e1", MarkerKind::Intro, 100, 200, "manual").unwrap();
        let conn = p.get().unwrap();
        let m = &markers_for_item(&conn, "e1").unwrap()[0];
        assert_eq!((m.start_ms, m.end_ms), (100, 200));
    }
}
