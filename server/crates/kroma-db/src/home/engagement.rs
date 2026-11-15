//! What one viewer did with each title, folded per movie or show: the raw
//! material of their taste.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// One viewer's history with one movie or one show. An episode folds into its
/// show, so a binge reads as one strong entry and not as a row of weak ones.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Engagement {
    /// Episodes (or the movie itself) started at all.
    pub started: u32,
    /// Of those, the ones finished by the watched rule or marked watched.
    pub finished: u32,
    /// How far the furthest unfinished one got, on 0..1.
    pub furthest: f32,
    /// Play sessions recorded.
    pub plays: u32,
    /// Unix seconds of the latest sign of life, `0` when none carries a stamp.
    pub last_at: i64,
    /// Saved to their list.
    pub listed: bool,
}

/// Every title `user_id` has touched, keyed by movie or show id.
pub fn engagements(
    pool: &Pool,
    user_id: &str,
    played_percent: i64,
) -> Result<HashMap<String, Engagement>> {
    let conn = pool.get()?;
    let mut out: HashMap<String, Engagement> = HashMap::new();

    let finished = crate::playback::finished_sql(played_percent);
    let mut stmt = conn.prepare(&format!(
        "WITH touched(ent, item, done, ratio, at) AS ( \
           SELECT COALESCE(i.show_id, p.item_id), p.item_id, \
                  CASE WHEN {finished} THEN 1 ELSE 0 END, \
                  CASE WHEN COALESCE(p.duration_ms, i.duration_ms, 0) > 0 \
                       THEN MIN(1.0, p.position_ms * 1.0 / COALESCE(p.duration_ms, i.duration_ms)) \
                       ELSE 0.0 END, \
                  CAST(strftime('%s', p.updated_at) AS INTEGER) \
             FROM progress p JOIN items i ON i.id = p.item_id WHERE p.user_id = ?1 \
           UNION ALL \
           SELECT COALESCE(i.show_id, w.item_id), w.item_id, 1, 1.0, \
                  CAST(strftime('%s', w.watched_at) AS INTEGER) \
             FROM watched w LEFT JOIN items i ON i.id = w.item_id WHERE w.user_id = ?1) \
         SELECT ent, COUNT(DISTINCT item), \
                COUNT(DISTINCT CASE WHEN done = 1 THEN item END), \
                MAX(CASE WHEN done = 0 THEN ratio ELSE 0.0 END), MAX(at) \
           FROM touched GROUP BY ent"
    ))?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            Engagement {
                started: r.get(1)?,
                finished: r.get(2)?,
                furthest: r.get::<_, Option<f64>>(3)?.unwrap_or(0.0) as f32,
                plays: 0,
                last_at: r.get::<_, Option<i64>>(4)?.unwrap_or(0),
                listed: false,
            },
        ))
    })?;
    for row in rows {
        let (id, engagement) = row?;
        out.insert(id, engagement);
    }
    drop(stmt);

    let mut stmt = conn.prepare(
        "SELECT COALESCE(i.show_id, ph.item_id), COUNT(*), MAX(ph.ended_at) \
           FROM play_history ph LEFT JOIN items i ON i.id = ph.item_id \
          WHERE ph.user_id = ?1 AND ph.item_id IS NOT NULL GROUP BY 1",
    )?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, u32>(1)?,
            r.get::<_, Option<i64>>(2)?.unwrap_or(0),
        ))
    })?;
    for row in rows {
        let (id, plays, at) = row?;
        let entry = out.entry(id).or_default();
        entry.plays = plays;
        entry.last_at = entry.last_at.max(at);
    }
    drop(stmt);

    let mut stmt = conn.prepare(
        "SELECT item_id, CAST(strftime('%s', added_at) AS INTEGER) FROM my_list WHERE user_id = ?1",
    )?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0)))
    })?;
    for row in rows {
        let (id, at) = row?;
        let entry = out.entry(id).or_default();
        entry.listed = true;
        entry.last_at = entry.last_at.max(at);
    }
    Ok(out)
}

/// Which titles each viewer of the household played, as `(user, movie or show)`
/// pairs: what "people who watch what you watch" is computed from.
pub fn household_plays(pool: &Pool) -> Result<Vec<(String, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT ph.user_id, COALESCE(i.show_id, ph.item_id) \
           FROM play_history ph LEFT JOIN items i ON i.id = ph.item_id \
          WHERE ph.user_id IS NOT NULL AND ph.item_id IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::{seeded, seeded_user};

    #[test]
    fn a_finished_film_and_a_sampled_one_read_differently() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::upsert_progress(&pool, &user, "c1", 7_000_000, Some(7_200_000)).unwrap();
        crate::upsert_progress(&pool, &user, "c2", 600_000, Some(7_200_000)).unwrap();

        let seen = engagements(&pool, &user, 90).unwrap();

        assert_eq!((seen["c1"].started, seen["c1"].finished), (1, 1));
        assert_eq!((seen["c2"].started, seen["c2"].finished), (1, 0));
        assert!((seen["c2"].furthest - 600_000.0 / 7_200_000.0).abs() < 1e-4);
        assert!(seen["c1"].last_at > 0);
    }

    #[test]
    fn an_episode_folds_into_its_show_and_is_counted_once() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::upsert_progress(&pool, &user, "e1", 3_000_000, Some(3_000_000)).unwrap();
        crate::mark_watched(&pool, &user, "e1").unwrap();

        let seen = engagements(&pool, &user, 90).unwrap();

        assert!(!seen.contains_key("e1"));
        assert_eq!((seen["sh1"].started, seen["sh1"].finished), (1, 1));
    }

    #[test]
    fn a_saved_title_and_a_replayed_one_carry_their_own_marks() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::add_to_list(&pool, &user, "c2").unwrap();
        let conn = pool.get().unwrap();
        for id in ["p1", "p2"] {
            conn.execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES (?1,?2,'c1','movie','T',0,500)",
                params![id, user],
            )
            .unwrap();
        }
        drop(conn);

        let seen = engagements(&pool, &user, 90).unwrap();

        assert!(seen["c2"].listed);
        assert_eq!(seen["c2"].started, 0);
        assert_eq!(seen["c1"].plays, 2);
        assert_eq!(seen["c1"].last_at, 500);
    }

    #[test]
    fn somebody_else_s_history_is_not_theirs() {
        let pool = seeded();
        let user = seeded_user(&pool);
        crate::upsert_progress(&pool, &user, "c1", 7_000_000, Some(7_200_000)).unwrap();

        assert!(engagements(&pool, "nobody", 90).unwrap().is_empty());
    }

    #[test]
    fn the_household_s_plays_fold_episodes_and_drop_anonymous_ones() {
        let pool = seeded();
        let conn = pool.get().unwrap();
        for (id, user, item) in [("p1", Some("u1"), "e1"), ("p2", Some("u1"), "e1"), ("p3", None, "c1")] {
            conn.execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES (?1,?2,?3,'movie','T',0,1)",
                params![id, user, item],
            )
            .unwrap();
        }
        drop(conn);

        let plays = household_plays(&pool).unwrap();

        assert_eq!(plays, [("u1".to_string(), "sh1".to_string())]);
    }
}
