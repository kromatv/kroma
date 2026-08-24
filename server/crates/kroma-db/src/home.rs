//! Catalog queries that back the home-screen section generator: trending (recency
//! -weighted play counts), recently-added, the user's last play, batch hydration
//! by id, and the embedding-cache staleness stamp.

use super::*;

mod genre_guard;
mod hydration;

#[cfg(test)]
mod test_support;

pub use genre_guard::*;
pub use hydration::*;

/// Top `n` *entity* ids by recency-weighted play count over the last 30 days a
/// half-life decay so a burst last week outranks a stale all-time favourite.
/// 604800 s = 1-week half-life; 2592000 s = 30-day window.
///
/// An episode play folds into its parent show (`COALESCE(show_id, item_id)`):
/// the home row hydrates these ids through [`entities_by_ids`], which only knows
/// how to render movies and shows an episode id would hydrate as a
/// `SectionItem::Movie` with no poster art (episodes carry none, only the show
/// does) and route to the wrong page. Folding also aggregates every episode of a
/// binged show into one trending entry instead of a row of near-duplicate cards.
///
/// The decay is `1 / 2^weeks` computed with a left shift on *whole* weeks
/// (integer division), not `POW()`: the bundled SQLite is compiled without
/// `SQLITE_ENABLE_MATH_FUNCTIONS`, so `POW` does not exist there and the query
/// used to fail on every call in production. Whole-week steps make the decay a
/// staircase rather than a smooth curve, which the ranking does not care about
/// (the window only spans 5 steps). The shift is clamped to 0..=62: a clock
/// jump could otherwise make it negative (SQLite would shift the other way and
/// divide by zero) or overflow a 64-bit shift.
pub fn trending_ids(pool: &Pool, n: usize) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(i.show_id, ph.item_id) AS ent_id, \
                SUM(1.0 / (1 << MIN(MAX((strftime('%s','now') - ph.ended_at) / 604800, 0), 62))) AS score \
         FROM play_history ph \
         LEFT JOIN items i ON i.id = ph.item_id \
         WHERE ph.item_id IS NOT NULL AND ph.ended_at > strftime('%s','now') - 2592000 \
         GROUP BY ent_id ORDER BY score DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![n as i64], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Most-recently-added movie ids (episodes excluded rows are movie/show level).
pub fn recently_added_ids(pool: &Pool, n: usize) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn
        .prepare("SELECT id FROM items WHERE kind != 'episode' ORDER BY added_at DESC LIMIT ?1")?;
    let rows = stmt.query_map(params![n as i64], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The user's most recently finished item id (for "Because you watched …").
pub fn last_played(pool: &Pool, user_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT item_id FROM play_history \
         WHERE user_id = ?1 AND item_id IS NOT NULL \
         ORDER BY ended_at DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![user_id], |r| r.get::<_, String>(0))?;
    Ok(rows.next().transpose()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn recently_added_last_played_and_trending() {
        let p = seeded();
        {
            let conn = p.get().unwrap();
            // Two recent plays of 'c1', one of 'c2' (item_id has no FK here).
            for (id, item) in [("p1", "c1"), ("p2", "c1"), ("p3", "c2")] {
                conn.execute(
                    "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                     VALUES (?1,'u1',?2,'movie','T',0,strftime('%s','now'))",
                    params![id, item],
                )
                .unwrap();
            }
        }
        // recently-added excludes episodes; newest added_at first.
        let recent = recently_added_ids(&p, 10).unwrap();
        assert!(!recent.contains(&"e1".to_string())); // episodes excluded
                                                      // Newest added_at first: nogen (2022) before c2 (2021) before c1 (2020).
        let idx = |id: &str| recent.iter().position(|x| x == id).unwrap();
        assert!(idx("nogen") < idx("c2") && idx("c2") < idx("c1"));

        assert!(last_played(&p, "u1").unwrap().is_some());
        assert!(last_played(&p, "nobody").unwrap().is_none());
    }

    #[test]
    fn trending_ids_ranks_by_recency_weighted_plays() {
        let p = seeded();
        let day = 86_400i64;
        {
            let conn = p.get().unwrap();
            let play = |item: &str, ago: i64| {
                let id = format!("ph-{item}-{ago}-{}", SEQ.fetch_add(1, Ordering::Relaxed));
                conn.execute(
                    "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                     VALUES (?1,'u1',?2,'movie','T',0,strftime('%s','now') - ?3)",
                    params![id, item, ago],
                )
                .unwrap();
            };
            // 3 plays yesterday: full weight (week 0) -> 3.0.
            for _ in 0..3 {
                play("c1", day);
            }
            // 3 plays 25 days ago: week 3 -> 3 * 0.125 = 0.375.
            for _ in 0..3 {
                play("c2", 25 * day);
            }
            // 5 plays 21 days ago: week 3 -> 5 * 0.125 = 0.625. More plays than c1,
            // but staler, so the decay must still put it behind.
            for _ in 0..5 {
                play("nogen", 21 * day);
            }
            // Played 10x two months ago: outside the 30-day window entirely.
            for _ in 0..10 {
                play("seed", 60 * day);
            }
        }

        let top = trending_ids(&p, 10).unwrap();
        // Recency beats raw count, and among equal counts the fresher wins.
        assert_eq!(
            top,
            vec!["c1".to_string(), "nogen".to_string(), "c2".to_string()]
        );
        // The two-month-old binge is out of the window, so it never shows.
        assert!(!top.contains(&"seed".to_string()));
        // The limit is honoured.
        assert_eq!(
            trending_ids(&p, 2).unwrap(),
            vec!["c1".to_string(), "nogen".to_string()]
        );
    }

    #[test]
    fn trending_folds_episodes_into_their_show() {
        let p = seeded();
        {
            let conn = p.get().unwrap();
            // A single fresh episode play. 'e1' belongs to show 'sh1'.
            conn.execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES ('phe','u1','e1','episode','Ep',0,strftime('%s','now'))",
                [],
            )
            .unwrap();
        }
        let top = trending_ids(&p, 10).unwrap();
        // The episode surfaces as its parent show, never as the raw episode id
        // (episodes have no poster art and route to the wrong page).
        assert!(top.contains(&"sh1".to_string()));
        assert!(!top.contains(&"e1".to_string()));
    }
}
