//! Shows that gained episodes lately, and when a show first arrived.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// A show with episodes added since a given moment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FreshShow {
    pub show_id: String,
    /// Episodes added since then.
    pub fresh: u32,
    /// Unix seconds its oldest episode was added: a show whose first episode is
    /// itself recent is a new show, not an old one with new episodes.
    pub first_at: i64,
    pub last_at: i64,
    /// The latest of the fresh episodes, by season then number.
    pub season: u32,
    pub episode: u32,
}

/// Shows with an episode added at or after `since` (Unix seconds), the most
/// recently fed first.
pub fn fresh_shows(pool: &Pool, since: i64, n: usize) -> Result<Vec<FreshShow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT show_id, SUM(at >= ?1), MIN(at), MAX(at), \
                MAX(CASE WHEN at >= ?1 THEN season * 100000 + episode END) \
           FROM (SELECT show_id, COALESCE(season, 0) AS season, COALESCE(episode, 0) AS episode, \
                        COALESCE(CAST(strftime('%s', added_at) AS INTEGER), 0) AS at \
                   FROM items WHERE kind = 'episode' AND show_id IS NOT NULL) \
          GROUP BY show_id HAVING SUM(at >= ?1) > 0 \
          ORDER BY MAX(at) DESC, show_id LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![since, n as i64], |r| {
        let newest: i64 = r.get::<_, Option<i64>>(4)?.unwrap_or(0);
        Ok(FreshShow {
            show_id: r.get(0)?,
            fresh: r.get(1)?,
            first_at: r.get(2)?,
            last_at: r.get(3)?,
            season: (newest / 100_000) as u32,
            episode: (newest % 100_000) as u32,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Show ids by when their first episode arrived, newest first.
pub fn recently_added_show_ids(pool: &Pool, n: usize) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT show_id FROM items WHERE kind = 'episode' AND show_id IS NOT NULL \
          GROUP BY show_id ORDER BY MIN(added_at) DESC, show_id LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![n as i64], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::seeded;

    fn episode(pool: &Pool, id: &str, show: &str, season: u32, number: u32, added: &str) {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO shows (id,library,title,added_at) VALUES (?1,'lib',?1,'2020-01-01T00:00:00Z')",
            params![show],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES (?1,'episode','E','mkv','lib',?2,?3,?4,?5)",
            params![id, show, season, number, added],
        )
        .unwrap();
    }

    const JUNE: i64 = 1_780_272_000;

    #[test]
    fn a_show_fed_since_then_reports_its_latest_fresh_episode() {
        let pool = seeded();
        episode(&pool, "a1", "old", 1, 1, "2025-01-01T00:00:00Z");
        episode(&pool, "a2", "old", 2, 3, "2026-06-10T00:00:00Z");
        episode(&pool, "a3", "old", 2, 4, "2026-06-12T00:00:00Z");

        let fresh = fresh_shows(&pool, JUNE, 10).unwrap();
        let old = fresh.iter().find(|s| s.show_id == "old").unwrap();

        assert_eq!(old.fresh, 2);
        assert_eq!((old.season, old.episode), (2, 4));
        assert!(old.first_at < JUNE, "it was here before, so it is not a new show");
    }

    #[test]
    fn a_show_that_arrived_whole_since_then_reads_as_new() {
        let pool = seeded();
        episode(&pool, "n1", "new", 1, 1, "2026-06-10T00:00:00Z");
        episode(&pool, "n2", "new", 1, 2, "2026-06-10T00:00:00Z");

        let fresh = fresh_shows(&pool, JUNE, 10).unwrap();
        let new = fresh.iter().find(|s| s.show_id == "new").unwrap();

        assert!(new.first_at >= JUNE);
        assert_eq!(new.fresh, 2);
    }

    #[test]
    fn a_show_untouched_since_then_is_absent() {
        let pool = seeded();
        episode(&pool, "q1", "quiet", 1, 1, "2025-01-01T00:00:00Z");

        let fresh = fresh_shows(&pool, JUNE, 10).unwrap();

        assert!(fresh.iter().all(|s| s.show_id != "quiet"));
    }

    #[test]
    fn shows_are_listed_by_when_they_first_arrived() {
        let pool = seeded();
        episode(&pool, "o1", "older", 1, 1, "2025-01-01T00:00:00Z");
        episode(&pool, "o2", "older", 1, 2, "2026-06-20T00:00:00Z");
        episode(&pool, "n1", "newer", 1, 1, "2026-03-01T00:00:00Z");

        let ids = recently_added_show_ids(&pool, 10).unwrap();
        let at = |id: &str| ids.iter().position(|x| x == id).unwrap();

        assert!(at("newer") < at("older"));
    }
}
