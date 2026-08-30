//! The episode a show is left on, for shows with nothing mid-play.

use anyhow::Result;
use rusqlite::{params, Connection};

// The episode after the last watched one, for every show the user has watched and
// left with no episode in progress, newest show first: `(item_id, watched_at)`.
// A show that is caught up yields no row (the JOIN finds nothing to play).
fn sql() -> String {
    let resumable = crate::playback::resumable_sql();
    format!(
        "\
WITH busy AS ( \
    SELECT DISTINCT pi.show_id AS show_id \
      FROM progress p JOIN items pi ON pi.id = p.item_id \
     WHERE p.user_id = ?1 AND pi.show_id IS NOT NULL AND {resumable} \
), seen AS ( \
    SELECT i.show_id AS show_id, \
           MAX(w.watched_at) AS watched_at, \
           MAX(COALESCE(i.season,0) * 1000000 + COALESCE(i.episode,0)) AS rank \
      FROM watched w JOIN items i ON i.id = w.item_id \
     WHERE w.user_id = ?1 AND i.kind = 'episode' AND i.show_id IS NOT NULL \
       AND i.show_id NOT IN (SELECT show_id FROM busy) \
     GROUP BY i.show_id \
) \
SELECT next.id, seen.watched_at \
  FROM seen \
  JOIN items next ON next.id = ( \
       SELECT e.id FROM items e \
        WHERE e.show_id = seen.show_id AND e.kind = 'episode' \
          AND COALESCE(e.season,0) * 1000000 + COALESCE(e.episode,0) > seen.rank \
          AND NOT EXISTS (SELECT 1 FROM watched w2 \
                           WHERE w2.user_id = ?1 AND w2.item_id = e.id) \
          AND NOT EXISTS (SELECT 1 FROM progress p2 \
                           WHERE p2.user_id = ?1 AND p2.item_id = e.id) \
        ORDER BY e.season, e.episode LIMIT 1) \
 ORDER BY seen.watched_at DESC LIMIT ?2"
    )
}

pub(super) fn on_deck(
    conn: &Connection,
    user_id: &str,
    limit: usize,
) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(&sql())?;
    let rows = stmt
        .query_map(params![user_id, limit as i64], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
