//! What a user can pick up again, newest first.

use anyhow::Result;
use rusqlite::params;

use crate::hydrate::items_by_ids_ordered;
use crate::pool::Pool;
use crate::rows::parse_metadata;
use kroma_domain::{ContinueItem, Kind, MediaItem};

/// "Continue watching": resumable items (started, not yet ~finished), newest
/// first, each carried as a full [`MediaItem`] so clients render normal cards.
pub fn continue_watching(pool: &Pool, user_id: &str) -> Result<Vec<ContinueItem>> {
    let conn = pool.get()?;
    // The JOIN drops any orphan progress row whose item no longer exists.
    let mut stmt = conn.prepare(
        "SELECT p.item_id,p.position_ms,p.duration_ms,p.updated_at \
         FROM progress p JOIN items i ON i.id = p.item_id \
         WHERE p.user_id = ?1 AND p.position_ms > 15000 \
           AND (p.duration_ms IS NULL OR p.position_ms < p.duration_ms * 95 / 100) \
         ORDER BY p.updated_at DESC LIMIT 30",
    )?;
    let rows: Vec<(String, i64, Option<i64>, String)> = stmt
        .query_map(params![user_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let ids: Vec<&str> = rows.iter().map(|(id, _, _, _)| id.as_str()).collect();
    let items = items_by_ids_ordered(&conn, &ids)?;
    let mut by_id: std::collections::HashMap<String, MediaItem> =
        items.into_iter().map(|i| (i.id.clone(), i)).collect();

    // Episodes carry no poster of their own, so a Continue tile would fall back
    // to a placeholder. Borrow the parent show's artwork (keeping any
    // episode-specific still as the backdrop) one query for all shows.
    let show_ids: Vec<String> = by_id
        .values()
        .filter(|i| i.kind == Kind::Episode)
        .filter_map(|i| i.show_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let mut show_meta_by_id: std::collections::HashMap<String, Option<String>> =
        std::collections::HashMap::new();
    for chunk in show_ids.chunks(super::IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt =
            conn.prepare(&format!("SELECT id, metadata FROM shows WHERE id IN ({ph})"))?;
        let metas = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })?;
        for row in metas {
            let (id, json) = row?;
            show_meta_by_id.insert(id, json);
        }
    }

    let mut out = Vec::with_capacity(rows.len());
    for (item_id, position_ms, duration_ms, updated_at) in rows {
        let Some(mut item) = by_id.remove(&item_id) else { continue };
        if item.kind == Kind::Episode {
            let json = item
                .show_id
                .as_ref()
                .and_then(|sid| show_meta_by_id.get(sid).cloned())
                .flatten();
            if let Some(mut show_meta) = parse_metadata(json) {
                if let Some(still) = item.metadata.as_ref().and_then(|m| m.backdrop_url.clone()) {
                    show_meta.backdrop_url = Some(still);
                }
                item.metadata = Some(show_meta);
            }
        }
        out.push(ContinueItem { item, position_ms, duration_ms, updated_at });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::test_support::*;

    #[test]
    fn continue_watching_filters_and_orders() {
        let (pool, uid) = pool_with_user(); // m1 already an item
        for id in ["low", "done", "nodur"] {
            seed_movie(&pool, id);
        }
        {
            let conn = pool.get().unwrap();
            // (item, position, duration, updated_at)
            let rows: [(&str, i64, Option<i64>, &str); 4] = [
                // Resumable, older.
                ("nodur", 30_000, None, "2021-01-01T00:00:00Z"),
                // Resumable, newer -> should come first.
                ("m1", 20_000, Some(100_000), "2021-01-02T00:00:00Z"),
                // Below the 15s floor -> excluded.
                ("low", 5_000, Some(100_000), "2021-01-03T00:00:00Z"),
                // Past 95% -> counts as finished -> excluded.
                ("done", 96_000, Some(100_000), "2021-01-04T00:00:00Z"),
            ];
            for (id, pos, dur, at) in rows {
                conn.execute(
                    "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) \
                     VALUES (?1,?2,?3,?4,?5)",
                    params![uid, id, pos, dur, at],
                )
                .unwrap();
            }
        }

        let cw = continue_watching(&pool, &uid).unwrap();
        let ids: Vec<&str> = cw.iter().map(|c| c.item.id.as_str()).collect();
        // Only the two resumable rows, newest-first (m1 then nodur).
        assert_eq!(ids, vec!["m1", "nodur"]);
        assert_eq!(cw[0].position_ms, 20_000);
        assert_eq!(cw[0].duration_ms, Some(100_000));
        assert_eq!(cw[1].position_ms, 30_000);
        assert_eq!(cw[1].duration_ms, None);
    }

    #[test]
    fn continue_watching_episode_borrows_show_artwork() {
        let (pool, uid) = pool_with_user();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,metadata,added_at) VALUES ('s1','lib','Show',?1,'t')",
                params![r#"{"tmdbId":10,"genres":[],"tmdbUrl":"http://tmdb/show","posterUrl":"show-poster.jpg","backdropUrl":"show-backdrop.jpg"}"#],
            )
            .unwrap();
            // Episode carries only its own still as backdrop, no poster of its own.
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,metadata,added_at) \
                 VALUES ('e1','episode','Ep','mkv','lib','s1',1,1,?1,'t')",
                params![r#"{"tmdbId":11,"genres":[],"tmdbUrl":"http://tmdb/ep","backdropUrl":"episode-still.jpg"}"#],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) \
                 VALUES (?1,'e1',20000,100000,'2021-01-01T00:00:00Z')",
                params![uid],
            )
            .unwrap();
        }

        let cw = continue_watching(&pool, &uid).unwrap();
        assert_eq!(cw.len(), 1);
        let meta = cw[0].item.metadata.as_ref().expect("episode inherits show metadata");
        // Poster comes from the show; backdrop keeps the episode-specific still.
        assert_eq!(meta.poster_url.as_deref(), Some("show-poster.jpg"));
        assert_eq!(meta.backdrop_url.as_deref(), Some("episode-still.jpg"));
    }
}
