//! What the library holds: per-library counts, bytes on disk, enrichment cover.

use anyhow::Result;

use crate::Pool;

/// Per-library item count + total bytes on disk.
pub fn library_stats(pool: &Pool) -> Result<Vec<kroma_domain::LibraryStat>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT i.library, COUNT(DISTINCT i.id) AS items, COALESCE(SUM(f.size),0) AS bytes \
         FROM items i LEFT JOIN files f ON f.item_id = i.id \
         GROUP BY i.library",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(kroma_domain::LibraryStat {
            id: r.get(0)?,
            item_count: r.get(1)?,
            total_bytes: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Total bytes across all indexed files (the "Utilisé" storage stat).
pub fn total_media_bytes(pool: &Pool) -> Result<i64> {
    let conn = pool.get()?;
    Ok(conn.query_row("SELECT COALESCE(SUM(size),0) FROM files", [], |r| r.get(0))?)
}

/// Counts for the cache panel: `(enriched items, enriched shows, embeddings)`
/// how many movies/videos and shows carry resolved TMDB metadata, and how many
/// title embeddings are stored.
pub fn metadata_counts(pool: &Pool) -> Result<(i64, i64, i64)> {
    let conn = pool.get()?;
    // Episodes also carry metadata but aren't "titles"; exclude them so the
    // count matches the movie/loose-video figure the panel documents.
    let items: i64 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE metadata IS NOT NULL AND kind != 'episode'",
        [],
        |r| r.get(0),
    )?;
    let shows: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shows WHERE metadata IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    let vectors: i64 = conn.query_row("SELECT COUNT(*) FROM item_vectors", [], |r| r.get(0))?;
    Ok((items, shows, vectors))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::test_support::*;

    #[test]
    fn library_and_metadata_stats() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES ('m1','movie','Dune','mkv','lib','t','{\"tmdbId\":1}')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m2','movie','U','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id,item_id,abs_path,size) VALUES ('f1','m1','/a',1500)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id,item_id,abs_path,size) VALUES ('f2','m1','/b',500)",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','S','t','{\"tmdbId\":2}')", []).unwrap();
            conn.execute(
                "INSERT INTO item_vectors (id,dim,vec,updated_at) VALUES ('m1',2,x'0000','t')",
                [],
            )
            .unwrap();
        }
        let stats = library_stats(&p).unwrap();
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].id, "lib");
        assert_eq!(stats[0].item_count, 2);
        assert_eq!(stats[0].total_bytes, 2000);
        assert_eq!(total_media_bytes(&p).unwrap(), 2000);
        // 1 enriched movie, 1 enriched show, 1 embedding.
        assert_eq!(metadata_counts(&p).unwrap(), (1, 1, 1));
    }

    #[test]
    fn the_cache_panel_counts_error_rather_than_reporting_an_empty_catalogue() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE items").unwrap();

        assert!(metadata_counts(&p).is_err());
    }
}
