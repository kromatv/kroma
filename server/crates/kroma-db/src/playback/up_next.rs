//! The episode to play next, and the ones after it.

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::hydrate::attach_files;
use crate::pool::Pool;
use crate::rows::row_to_item;
use crate::schema::ITEM_COLS;
use kroma_domain::MediaItem;

/// The episode to play to CONTINUE a show, for a user: the most-recent in-progress
/// episode (resume), else the first unwatched episode in order, else the first.
/// Returns the hydrated episode plus whether it has a saved resume position.
pub fn up_next_episode(
    pool: &Pool,
    user_id: &str,
    show_id: &str,
) -> Result<Option<(MediaItem, bool)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {ITEM_COLS} FROM items \
         WHERE show_id = ?1 AND kind = 'episode' ORDER BY season, episode"
    ))?;
    let episodes: Vec<MediaItem> = stmt
        .query_map(params![show_id], row_to_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    if episodes.is_empty() {
        return Ok(None);
    }

    // Resume: the most-recently-updated in-progress episode of this show.
    let mut rs = conn.prepare(
        "SELECT p.item_id FROM progress p JOIN items i ON i.id = p.item_id \
         WHERE p.user_id = ?1 AND i.show_id = ?2 AND p.position_ms > 15000 \
           AND (p.duration_ms IS NULL OR p.position_ms < p.duration_ms * 95 / 100) \
         ORDER BY p.updated_at DESC LIMIT 1",
    )?;
    let resume_id = rs
        .query_map(params![user_id, show_id], |r| r.get::<_, String>(0))?
        .next()
        .transpose()?;
    drop(rs);

    let (mut chosen, resume) = if let Some(id) = resume_id {
        match episodes.iter().find(|e| e.id == id).cloned() {
            Some(e) => (e, true),
            None => (episodes[0].clone(), false),
        }
    } else {
        // The episode AFTER the last (highest, by season/episode) watched one, so
        // finishing E2 continues at E3 even if an earlier episode is unwatched
        // (Plex/Netflix "on deck"). Caught up / nothing watched → the first.
        let mut ws = conn.prepare(
            "SELECT w.item_id FROM watched w JOIN items i ON i.id = w.item_id \
             WHERE w.user_id = ?1 AND i.show_id = ?2",
        )?;
        let seen: std::collections::HashSet<String> = ws
            .query_map(params![user_id, show_id], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<_>>()?;
        drop(ws);
        // `episodes` is ordered by (season, episode); the next after the last seen.
        let next = match episodes.iter().rposition(|e| seen.contains(&e.id)) {
            Some(i) => episodes.get(i + 1).or_else(|| episodes.first()).cloned(),
            None => episodes.first().cloned(),
        };
        (next.unwrap_or_else(|| episodes[0].clone()), false)
    };

    attach_files(&conn, &mut chosen)?;
    Ok(Some((chosen, resume)))
}

/// The next `n` episodes after `item_id` in its show, by `(season, episode)`
/// order. Empty for a movie / loose video / the last episode. Drives the
/// player's "up next" episode rail (autoplay is the `n == 1` case).
pub fn following_episodes(pool: &Pool, item_id: &str, n: usize) -> Result<Vec<MediaItem>> {
    if n == 0 {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let coords: Option<(Option<String>, Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT show_id, season, episode FROM items WHERE id = ?1",
            params![item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((Some(show_id), Some(season), Some(episode))) = coords else {
        return Ok(Vec::new());
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT {ITEM_COLS} FROM items \
         WHERE show_id = ?1 AND kind = 'episode' \
           AND (season > ?2 OR (season = ?2 AND episode > ?3)) \
         ORDER BY season, episode LIMIT ?4"
    ))?;
    let mut items: Vec<MediaItem> = stmt
        .query_map(params![show_id, season, episode, n as i64], row_to_item)?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);
    // Batch-hydrate (files + markers in one query each) instead of N queries per
    // episode - this rail can be up to UP_NEXT_EPISODES rows on every watch load.
    super::attach_files_batch(&conn, &mut items)?;
    Ok(items)
}

/// The next episode after `item_id` in its show, by `(season, episode)` order.
/// `None` for a movie / loose video / the last episode.
pub fn next_episode(pool: &Pool, item_id: &str) -> Result<Option<MediaItem>> {
    Ok(following_episodes(pool, item_id, 1)?.into_iter().next())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::test_support::*;
    use crate::playback::{mark_watched, unmark_watched, upsert_progress};

    #[test]
    fn up_next_and_next_episode() {
        let (pool, uid) = pool_with_user();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
            for (id, s, e) in [("e1", 1, 1), ("e2", 1, 2), ("e3", 1, 3)] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES (?1,'episode','Ep','mkv','lib','s1',?2,?3,'t')",
                    params![id, s, e],
                )
                .unwrap();
            }
        }

        // Fresh: nothing watched / in progress → first episode, not a resume.
        let (item, resume) = up_next_episode(&pool, &uid, "s1").unwrap().unwrap();
        assert_eq!(item.id, "e1");
        assert!(!resume);

        // e1 watched → continue after the last watched = e2.
        mark_watched(&pool, &uid, "e1").unwrap();
        let (item, resume) = up_next_episode(&pool, &uid, "s1").unwrap().unwrap();
        assert_eq!(item.id, "e2");
        assert!(!resume);

        // Only e2 watched (e1 NOT) → still continue AFTER the highest watched = e3,
        // not the first unwatched (e1). This is the on-deck behaviour.
        unmark_watched(&pool, &uid, "e1").unwrap();
        mark_watched(&pool, &uid, "e2").unwrap();
        let (item, resume) = up_next_episode(&pool, &uid, "s1").unwrap().unwrap();
        assert_eq!(item.id, "e3");
        assert!(!resume);

        // e2 in progress → resume e2 (takes priority over on-deck).
        upsert_progress(&pool, &uid, "e2", 60_000, Some(600_000)).unwrap();
        let (item, resume) = up_next_episode(&pool, &uid, "s1").unwrap().unwrap();
        assert_eq!(item.id, "e2");
        assert!(resume);

        // Sequence: next after e2 is e3; e3 is last; movies have no next.
        assert_eq!(
            next_episode(&pool, "e2").unwrap().map(|i| i.id),
            Some("e3".into())
        );
        assert!(next_episode(&pool, "e3").unwrap().is_none());
        assert!(next_episode(&pool, "m1").unwrap().is_none());

        // The "up next" EPISODE rail: the next N in order, capped by `n`, empty
        // for the last episode / a movie / n == 0.
        let ids = |v: Vec<MediaItem>| v.into_iter().map(|i| i.id).collect::<Vec<_>>();
        assert_eq!(
            ids(following_episodes(&pool, "e1", 10).unwrap()),
            vec!["e2", "e3"]
        );
        assert_eq!(ids(following_episodes(&pool, "e1", 1).unwrap()), vec!["e2"]); // capped by n
        assert!(following_episodes(&pool, "e3", 10).unwrap().is_empty()); // last episode
        assert!(following_episodes(&pool, "m1", 10).unwrap().is_empty()); // a movie
        assert!(following_episodes(&pool, "e1", 0).unwrap().is_empty()); // n == 0
    }

    #[test]
    fn a_resume_row_on_something_that_is_not_an_episode_falls_back_to_the_first() {
        let (pool, uid) = pool_with_user();
        seed_show(&pool, "s1", "e", 3);
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO items (id,kind,title,container,library,show_id,added_at) \
                 VALUES ('extra','video','Behind the scenes','mkv','lib','s1','t')",
                [],
            )
            .unwrap();
        upsert_progress(&pool, &uid, "extra", 60_000, Some(600_000)).unwrap();

        let (item, resume) = up_next_episode(&pool, &uid, "s1").unwrap().unwrap();
        assert_eq!(item.id, "e1");
        assert!(
            !resume,
            "a bonus feature carries no episode resume position"
        );
    }
}
