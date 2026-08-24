//! How far through a show a user is, as a percent.

use anyhow::Result;
use rusqlite::params;

use crate::pool::Pool;

/// Per-user progress through each show, as a percent 0–100 (only shows with >0).
/// `(watched episodes + the in-progress episode's fraction) / total episodes`
/// a Plex-style series completion bar for show cards.
pub fn show_progress(pool: &Pool, user_id: &str) -> Result<std::collections::HashMap<String, u8>> {
    use std::collections::HashMap;
    let conn = pool.get()?;

    // Total episodes per show.
    let mut totals: HashMap<String, i64> = HashMap::new();
    {
        let mut s = conn.prepare(
            "SELECT show_id, COUNT(*) FROM items \
             WHERE kind = 'episode' AND show_id IS NOT NULL GROUP BY show_id",
        )?;
        for row in s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (show, n) = row?;
            totals.insert(show, n);
        }
    }

    // Watched episodes per show.
    let mut watched: HashMap<String, i64> = HashMap::new();
    {
        let mut s = conn.prepare(
            "SELECT i.show_id, COUNT(*) FROM watched w JOIN items i ON i.id = w.item_id \
             WHERE w.user_id = ?1 AND i.kind = 'episode' AND i.show_id IS NOT NULL GROUP BY i.show_id",
        )?;
        for row in s.query_map(params![user_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })? {
            let (show, n) = row?;
            watched.insert(show, n);
        }
    }

    // Most-recent in-progress episode's fraction per show (watched + in-progress are
    // disjoint: mark_watched deletes the progress row).
    let mut frac: HashMap<String, f64> = HashMap::new();
    {
        let mut s = conn.prepare(
            "SELECT i.show_id, p.position_ms, p.duration_ms FROM progress p JOIN items i ON i.id = p.item_id \
             WHERE p.user_id = ?1 AND i.kind = 'episode' AND i.show_id IS NOT NULL AND p.position_ms > 15000 \
               AND (p.duration_ms IS NULL OR p.position_ms < p.duration_ms * 95 / 100) \
             ORDER BY p.updated_at DESC",
        )?;
        for row in s.query_map(params![user_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<i64>>(2)?,
            ))
        })? {
            let (show, pos, dur) = row?;
            // ORDER BY updated_at DESC → keep the first (most recent) per show.
            frac.entry(show).or_insert_with(|| match dur {
                Some(d) if d > 0 => (pos as f64 / d as f64).clamp(0.0, 1.0),
                _ => 0.0,
            });
        }
    }

    let mut out = HashMap::new();
    for (show, total) in totals {
        if total <= 0 {
            continue;
        }
        let w = *watched.get(&show).unwrap_or(&0) as f64;
        let f = *frac.get(&show).unwrap_or(&0.0);
        let pct = ((w + f) / total as f64 * 100.0).round().clamp(0.0, 100.0) as u8;
        if pct > 0 {
            out.insert(show, pct);
        }
    }
    Ok(out)
}

/// Series-completion percent (0–100) for a single show, or `None` if no progress
/// (lighter than [`show_progress`] for a one-show detail page).
pub fn show_progress_one(pool: &Pool, user_id: &str, show_id: &str) -> Result<Option<u8>> {
    let conn = pool.get()?;
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE kind = 'episode' AND show_id = ?1",
        params![show_id],
        |r| r.get(0),
    )?;
    if total <= 0 {
        return Ok(None);
    }
    let watched: i64 = conn.query_row(
        "SELECT COUNT(*) FROM watched w JOIN items i ON i.id = w.item_id \
         WHERE w.user_id = ?1 AND i.kind = 'episode' AND i.show_id = ?2",
        params![user_id, show_id],
        |r| r.get(0),
    )?;
    let frac = {
        let mut s = conn.prepare(
            "SELECT p.position_ms, p.duration_ms FROM progress p JOIN items i ON i.id = p.item_id \
             WHERE p.user_id = ?1 AND i.show_id = ?2 AND i.kind = 'episode' AND p.position_ms > 15000 \
               AND (p.duration_ms IS NULL OR p.position_ms < p.duration_ms * 95 / 100) \
             ORDER BY p.updated_at DESC LIMIT 1",
        )?;
        let row = s
            .query_map(params![user_id, show_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?))
            })?
            .next()
            .transpose()?;
        match row {
            Some((pos, Some(d))) if d > 0 => (pos as f64 / d as f64).clamp(0.0, 1.0),
            _ => 0.0,
        }
    };
    let pct = ((watched as f64 + frac) / total as f64 * 100.0)
        .round()
        .clamp(0.0, 100.0) as u8;
    Ok(if pct > 0 { Some(pct) } else { None })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::test_support::*;
    use crate::playback::{continue_watching, mark_watched, upsert_progress};

    #[test]
    fn show_progress_and_one_compute_percent() {
        let (pool, uid) = pool_with_user();
        seed_show(&pool, "s1", "e", 4); // e1..e4
        seed_show(&pool, "s2", "f", 2); // f1..f2 (untouched)
        seed_show(&pool, "s3", "g", 2); // g1..g2 (fully watched)

        // s1: two watched + one in-progress at 0.4 -> (2 + 0.4)/4 = 60%.
        mark_watched(&pool, &uid, "e1").unwrap();
        mark_watched(&pool, &uid, "e2").unwrap();
        upsert_progress(&pool, &uid, "e3", 24_000, Some(60_000)).unwrap();

        // s3: both episodes watched -> 100%.
        mark_watched(&pool, &uid, "g1").unwrap();
        mark_watched(&pool, &uid, "g2").unwrap();

        let map = show_progress(&pool, &uid).unwrap();
        assert_eq!(map.get("s1"), Some(&60));
        assert_eq!(map.get("s3"), Some(&100));
        // s2 has no progress -> excluded (0% rows are dropped).
        assert_eq!(map.get("s2"), None);
        // Movies are never series-progress rows.
        assert_eq!(map.get("m1"), None);

        // Single-show variant agrees, and is None for no-progress / unknown shows.
        assert_eq!(show_progress_one(&pool, &uid, "s1").unwrap(), Some(60));
        assert_eq!(show_progress_one(&pool, &uid, "s3").unwrap(), Some(100));
        assert_eq!(show_progress_one(&pool, &uid, "s2").unwrap(), None);
        assert_eq!(
            show_progress_one(&pool, &uid, "no-such-show").unwrap(),
            None
        );
    }

    #[test]
    fn an_episode_of_an_unenriched_show_keeps_its_own_metadata() {
        let (pool, uid) = pool_with_user();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
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
        let meta = cw[0]
            .item
            .metadata
            .as_ref()
            .expect("the episode's own metadata is kept");
        assert_eq!(meta.backdrop_url.as_deref(), Some("episode-still.jpg"));
        assert!(
            meta.poster_url.is_none(),
            "there is no show artwork to borrow"
        );
    }

    #[test]
    fn an_in_progress_episode_of_unknown_length_counts_as_no_fraction() {
        let (pool, uid) = pool_with_user();
        seed_show(&pool, "s1", "e", 4);
        mark_watched(&pool, &uid, "e1").unwrap();
        upsert_progress(&pool, &uid, "e2", 30_000, None).unwrap();

        assert_eq!(show_progress(&pool, &uid).unwrap().get("s1"), Some(&25));
        assert_eq!(show_progress_one(&pool, &uid, "s1").unwrap(), Some(25));
    }

    #[test]
    fn a_single_shows_progress_errors_rather_than_reading_as_untouched() {
        let (pool, uid) = pool_with_user();
        seed_show(&pool, "s1", "e", 3);
        pool.get()
            .unwrap()
            .execute_batch("DROP TABLE watched")
            .unwrap();
        assert!(show_progress_one(&pool, &uid, "s1").is_err());

        pool.get()
            .unwrap()
            .execute_batch("DROP TABLE items")
            .unwrap();
        assert!(show_progress_one(&pool, &uid, "s1").is_err());
    }
}
